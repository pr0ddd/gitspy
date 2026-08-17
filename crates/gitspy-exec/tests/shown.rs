use gitspy_exec::Git;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn run(dir: &Path, args: &[&str]) {
    let ok = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .env("GIT_AUTHOR_NAME", "Ann")
        .env("GIT_AUTHOR_EMAIL", "ann@example.com")
        .env("GIT_COMMITTER_NAME", "Ann")
        .env("GIT_COMMITTER_EMAIL", "ann@example.com")
        .status()
        .expect("git runs")
        .success();
    assert!(ok, "fixture setup: git {args:?}");
}

fn repo_with_a_commit() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    std::fs::write(dir.path().join("a.txt"), "hi\n").expect("file written");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-q", "-m", "one"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git found")
}

#[test]
fn a_path_missing_from_the_ref_reads_as_empty() {
    let dir = repo_with_a_commit();
    let text = git()
        .file_at(dir.path(), "HEAD", "missing.txt")
        .expect("a file missing from a revision is not an error, it is the empty side of the diff");
    assert_eq!(text, "");
}

#[test]
fn a_broken_git_config_surfaces_as_an_error_not_as_an_empty_file() {
    let dir = repo_with_a_commit();
    let config = dir.path().join(".git").join("config");
    let mut text = std::fs::read_to_string(&config).expect("config read");
    text.push_str("[gpg\n");
    std::fs::write(&config, text).expect("config written");

    assert!(
        git().file_at(dir.path(), "HEAD", "a.txt").is_err(),
        "git refused for a reason other than a missing file: an empty diff would hide the breakage, the way it did with a broken gpg.format"
    );
}

fn repo_with_a_binary_commit() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    let mut bytes = Vec::with_capacity(300_000);
    for i in 0..300_000u32 {
        bytes.push((i % 251) as u8);
    }
    std::fs::write(dir.path().join("model.bin"), &bytes).expect("binary written");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-q", "-m", "one"]);
    dir
}

#[test]
fn a_binary_blob_reads_without_git_dying_of_a_closed_pipe() {
    let dir = repo_with_a_binary_commit();
    let text = git()
        .file_at(dir.path(), "HEAD", "model.bin")
        .expect("a binary blob is not a failure of git: it just holds bytes that are not text");
    assert!(
        text.len() > 100_000,
        "the whole blob comes through, not the part before the first line that is not UTF-8"
    );
}
