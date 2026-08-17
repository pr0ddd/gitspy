use gitspy_exec::Git;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn run(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "test@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .output()
        .expect("git runs");
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn write(dir: &Path, path: &str, text: &str) {
    std::fs::write(dir.join(path), text).expect("file written");
}

fn conflicted_repo() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    write(dir.path(), "story.txt", "the beginning\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "base"]);
    run(dir.path(), &["checkout", "-b", "feature"]);
    write(dir.path(), "story.txt", "their version\n");
    run(dir.path(), &["commit", "-am", "theirs"]);
    run(dir.path(), &["checkout", "main"]);
    write(dir.path(), "story.txt", "our version\n");
    run(dir.path(), &["commit", "-am", "ours"]);
    run(dir.path(), &["merge", "feature"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git found")
}

#[test]
fn conflict_sides_match_the_index_stages_git_itself_reports() {
    let dir = conflicted_repo();
    let sides = git()
        .conflict_sides(dir.path(), "story.txt")
        .expect("conflict sides read");
    assert_eq!(
        sides.base,
        run(dir.path(), &["show", ":1:story.txt"]) + "\n",
        "the base is index stage 1, the common ancestor"
    );
    assert_eq!(sides.ours, "our version\n", "our side is index stage 2");
    assert_eq!(
        sides.theirs, "their version\n",
        "their side is index stage 3"
    );
}

#[test]
fn the_merge_heading_names_the_incoming_branch_and_keeps_gits_own_subject() {
    let dir = conflicted_repo();
    let heading = git()
        .merge_heading(dir.path())
        .expect("MERGE_MSG exists while a merge is in progress");
    assert_eq!(
        heading.from.as_deref(),
        Some("feature"),
        "the pane needs the name of the incoming branch, and only MERGE_MSG carries it"
    );
    assert_eq!(
        heading.subject, "Merge branch 'feature'",
        "the draft message is the first line of MERGE_MSG, exactly as git wrote it"
    );
}

#[test]
fn a_calm_repository_has_no_merge_heading() {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    assert!(git().merge_heading(dir.path()).is_none());
}

#[test]
fn resolving_a_file_writes_the_chosen_text_and_leaves_no_conflict_behind() {
    let dir = conflicted_repo();
    git()
        .resolve_file(dir.path(), "story.txt", "reconciled\n")
        .expect("the resolution is written");

    let tree = git().status(dir.path()).expect("status read");
    assert_eq!(
        tree.change_counts().conflicts,
        0,
        "once resolved, git has to stop counting the file as conflicted"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("story.txt")).expect("file read"),
        "reconciled\n",
        "what lands on disk is exactly what the user assembled in the view"
    );
    assert_eq!(
        run(dir.path(), &["show", ":story.txt"]),
        "reconciled",
        "the resolution goes into the index, otherwise merge --continue never sees it"
    );
}

#[test]
fn the_merged_text_is_rebuilt_with_diff3_so_the_base_is_always_visible() {
    let dir = conflicted_repo();
    let merged = git()
        .conflict_merged(dir.path(), "story.txt")
        .expect("the merged text is rebuilt from the index stages");
    assert!(
        merged.contains("|||||||"),
        "without the base the view has nothing to show for an unresolved conflict"
    );
    assert!(merged.contains("our version"));
    assert!(merged.contains("their version"));
    assert!(
        merged.contains("the beginning"),
        "the base is the common ancestor, index stage 1"
    );
}
