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
    String::from_utf8_lossy(&out.stdout).to_string()
}

fn write(dir: &Path, path: &str, text: &str) {
    std::fs::write(dir.join(path), text).expect("file written");
}

fn far_apart(marker_top: &str, marker_bottom: &str) -> String {
    let middle: String = (1..=20).map(|n| format!("line {n}\n")).collect();
    format!("{marker_top}\n{middle}{marker_bottom}\n")
}

fn repo_with_two_hunks() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    write(dir.path(), "code.txt", &far_apart("top old", "bottom old"));
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "base"]);
    write(dir.path(), "code.txt", &far_apart("top new", "bottom new"));
    dir
}

fn git() -> Git {
    Git::discover().expect("git found")
}

fn header_and_last_hunk(diff: &str) -> String {
    let hunk_starts: Vec<usize> = diff.match_indices("\n@@ ").map(|(at, _)| at + 1).collect();
    let first = *hunk_starts.first().expect("the diff has hunks");
    let last = *hunk_starts.last().expect("the diff has hunks");
    format!("{}{}", &diff[..first], &diff[last..])
}

#[test]
fn the_unstaged_diff_of_two_distant_edits_has_two_hunks() {
    let dir = repo_with_two_hunks();
    let diff = git()
        .diff_unified(dir.path(), "code.txt", false)
        .expect("diff read");
    assert_eq!(
        diff.matches("@@").count() / 2,
        2,
        "two distant edits must arrive as separate hunks, otherwise there is nothing to stage"
    );
    assert!(diff.contains("-top old"));
    assert!(diff.contains("+top new"));
}

#[test]
fn applying_one_hunk_stages_half_of_the_change_and_reverse_takes_it_back() {
    let dir = repo_with_two_hunks();
    let diff = git()
        .diff_unified(dir.path(), "code.txt", false)
        .expect("diff read");

    let one_hunk = header_and_last_hunk(&diff);

    git()
        .apply_patch(dir.path(), &one_hunk, true, false)
        .expect("a single-hunk patch applies to the index");

    let staged = run(dir.path(), &["diff", "--cached", "--", "code.txt"]);
    assert!(
        staged.contains("+bottom new") && !staged.contains("+top new"),
        "the index must hold exactly the selected half of the edit"
    );

    git()
        .apply_patch(dir.path(), &one_hunk, true, true)
        .expect("the reverse patch unstages the hunk");
    assert_eq!(
        run(dir.path(), &["diff", "--cached", "--", "code.txt"]).trim(),
        "",
        "after reverse the index goes back to HEAD"
    );
}

#[test]
fn discarding_a_hunk_erases_the_edit_from_the_working_tree() {
    let dir = repo_with_two_hunks();
    let diff = git()
        .diff_unified(dir.path(), "code.txt", false)
        .expect("diff read");

    let one_hunk = header_and_last_hunk(&diff);

    git()
        .apply_patch(dir.path(), &one_hunk, false, true)
        .expect("the reverse patch on the working tree erases the edit");

    let text = std::fs::read_to_string(dir.path().join("code.txt")).expect("file read");
    assert!(
        text.contains("bottom old") && text.contains("top new"),
        "exactly one edit must be discarded, the other one survives"
    );
}
