use gitspy_exec::Git;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn run(dir: &Path, args: &[&str]) {
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
    assert!(out.status.success(), "the fixture command succeeded");
}

fn write(dir: &Path, path: &str, text: &str) {
    std::fs::write(dir.join(path), text).expect("file written");
}

fn git() -> Git {
    Git::discover().expect("git found")
}

#[test]
fn staged_diff_shows_only_the_index() {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    write(dir.path(), "staged.txt", "old\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "base"]);

    write(dir.path(), "staged.txt", "new staged\n");
    run(dir.path(), &["add", "staged.txt"]);
    write(dir.path(), "unstaged.txt", "loose change\n");

    let diff = git().staged_diff(dir.path()).expect("diff read");
    assert!(
        diff.contains("+new staged"),
        "the staged edit is in the diff"
    );
    assert!(
        !diff.contains("loose change"),
        "unstaged changes do not get into the diff"
    );
}

#[test]
fn clean_index_gives_empty_diff() {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    write(dir.path(), "a.txt", "content\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "base"]);

    let diff = git().staged_diff(dir.path()).expect("diff read");
    assert_eq!(
        diff.trim(),
        "",
        "a clean index gives an empty diff, not an error"
    );
}
