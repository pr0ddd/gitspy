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

fn repo() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    std::fs::write(dir.path().join("a.txt"), "a\n").expect("file written");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "start"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git found")
}

#[test]
fn head_branch_matches_symbolic_ref() {
    let dir = repo();
    let ours = git().head_branch(dir.path()).expect("branch read");
    let truth = run(dir.path(), &["symbolic-ref", "--short", "HEAD"]);
    assert_eq!(ours.as_deref(), Some(truth.as_str()));
}

#[test]
fn detached_head_has_no_branch() {
    let dir = repo();
    let head = run(dir.path(), &["rev-parse", "HEAD"]);
    run(dir.path(), &["checkout", "--detach", &head]);
    assert_eq!(git().head_branch(dir.path()).expect("branch read"), None);
}

#[test]
fn origin_url_is_read_and_absent_without_remote() {
    let dir = repo();
    assert_eq!(git().origin_url(dir.path()).expect("url read"), None);
    run(
        dir.path(),
        &["remote", "add", "origin", "git@github.com:me/tool.git"],
    );
    assert_eq!(
        git().origin_url(dir.path()).expect("url read").as_deref(),
        Some("git@github.com:me/tool.git")
    );
}
