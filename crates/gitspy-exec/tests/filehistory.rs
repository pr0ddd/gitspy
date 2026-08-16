use gitspy_exec::Git;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn run_as(dir: &Path, who: &str, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .env("GIT_AUTHOR_NAME", who)
        .env(
            "GIT_AUTHOR_EMAIL",
            format!("{}@example.com", who.to_lowercase()),
        )
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .output()
        .expect("git runs");
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn write(dir: &Path, path: &str, text: &str) {
    std::fs::write(dir.join(path), text).expect("file written");
}

fn renamed_repo() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    run_as(dir.path(), "Ann", &["init", "-b", "main"]);
    write(dir.path(), "old.txt", "one\ntwo\n");
    run_as(dir.path(), "Ann", &["add", "-A"]);
    run_as(dir.path(), "Ann", &["commit", "-m", "start"]);
    write(dir.path(), "old.txt", "one\ntwo\nthree\n");
    run_as(dir.path(), "Ann", &["commit", "-am", "grow"]);
    run_as(dir.path(), "Ann", &["mv", "old.txt", "new.txt"]);
    run_as(dir.path(), "Ann", &["commit", "-m", "rename"]);
    write(dir.path(), "new.txt", "ONE\ntwo\nthree\n");
    run_as(dir.path(), "Bob", &["commit", "-am", "shout"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git found")
}

#[test]
fn the_file_history_follows_the_rename_back_to_the_birth_of_the_file() {
    let dir = renamed_repo();
    let history = git()
        .file_history(dir.path(), "new.txt", None)
        .expect("file history read");

    assert_eq!(
        history
            .iter()
            .map(|c| c.subject.as_str())
            .collect::<Vec<_>>(),
        ["shout", "rename", "grow", "start"],
        "--follow has to carry the history through the rename"
    );
    assert_eq!(history[0].author, "Bob");
    assert_eq!(
        history[3].status, 'A',
        "the first commit of a file is its birth"
    );
    assert_eq!(
        history[1].old_path.as_deref(),
        Some("old.txt"),
        "for a rename the pane needs the old name"
    );
    assert_eq!(history[0].old_path, None);
    assert!(history[0].time > 0, "the date label needs the time");
    assert_eq!(
        history[3].path, "old.txt",
        "the diff of an old commit goes by the name the file had in that commit"
    );
    assert_eq!(history[0].path, "new.txt");
    assert_eq!(history[1].path, "new.txt");
}

#[test]
fn history_opened_from_a_commit_of_an_unmerged_branch_sees_its_file() {
    let dir = renamed_repo();
    run_as(dir.path(), "Ann", &["checkout", "-b", "feature", "HEAD~2"]);
    write(dir.path(), "only-here.txt", "alone\n");
    run_as(dir.path(), "Ann", &["add", "-A"]);
    run_as(dir.path(), "Ann", &["commit", "-m", "branch-only file"]);
    let tip = run_as(dir.path(), "Ann", &["rev-parse", "HEAD"]);
    run_as(dir.path(), "Ann", &["checkout", "main"]);

    let from_head = git()
        .file_history(dir.path(), "only-here.txt", None)
        .expect("history from HEAD read");
    assert!(
        from_head.is_empty(),
        "from HEAD a file of another branch is invisible, which is why the history needs a starting commit"
    );

    let history = git()
        .file_history(dir.path(), "only-here.txt", Some(&tip))
        .expect("history from the branch commit read");
    assert_eq!(
        history
            .iter()
            .map(|c| c.subject.as_str())
            .collect::<Vec<_>>(),
        ["branch-only file"],
        "a history opened from a commit has to walk from that commit, not from HEAD"
    );
}

#[test]
fn blame_spans_group_neighbouring_lines_of_one_commit() {
    let dir = renamed_repo();
    let spans = git()
        .blame_file(dir.path(), "new.txt", None)
        .expect("blame read");

    assert_eq!(
        spans
            .iter()
            .map(|s| (s.summary.as_str(), s.start_line, s.lines))
            .collect::<Vec<_>>(),
        [("shout", 1, 1), ("start", 2, 1), ("grow", 3, 1)],
        "every line remembers the commit that touched it, and neighbouring lines of one commit merge into a single span"
    );
    assert_eq!(spans[0].author, "Bob");
    assert_eq!(spans[1].author, "Ann");
}

#[test]
fn blame_at_an_old_commit_sees_the_file_before_the_shout() {
    let dir = renamed_repo();
    let grow = run_as(dir.path(), "Ann", &["rev-parse", "HEAD~2"]);
    let spans = git()
        .blame_file(dir.path(), "old.txt", Some(&grow))
        .expect("blame of the old snapshot read");
    assert_eq!(
        spans
            .iter()
            .map(|s| (s.summary.as_str(), s.lines))
            .collect::<Vec<_>>(),
        [("start", 2), ("grow", 1)],
        "at the grow snapshot the first two lines from start merge into a single span"
    );
}

#[test]
fn a_merge_that_brought_changes_into_the_file_is_part_of_its_history() {
    let dir = renamed_repo();
    run_as(dir.path(), "Ann", &["checkout", "-b", "side", "HEAD~2"]);
    write(dir.path(), "old.txt", "one\ntwo\nthree\nside\n");
    run_as(dir.path(), "Ann", &["commit", "-am", "side grows"]);
    run_as(dir.path(), "Ann", &["checkout", "main"]);
    run_as(dir.path(), "Ann", &["merge", "--no-edit", "side"]);

    let history = git()
        .file_history(dir.path(), "new.txt", None)
        .expect("file history read");
    let subjects: Vec<&str> = history.iter().map(|c| c.subject.as_str()).collect();
    assert!(
        subjects[0].starts_with("Merge"),
        "git log without --full-history silently hides merges, while the reference client shows them: {subjects:?}"
    );
    assert_eq!(
        history[0].path, "new.txt",
        "a merge has no name-status of its own, so the path is inherited from its neighbours"
    );
}
