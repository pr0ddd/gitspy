use gitspy_exec::{Cancel, Git};
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
        .env("GIT_AUTHOR_DATE", "1577836800 +0000")
        .env("GIT_COMMITTER_DATE", "1577836800 +0000")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

fn source() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    std::fs::write(dir.path().join("readme.md"), "hello").expect("file written");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "first"]);
    dir
}

#[test]
fn a_clone_leaves_a_working_repository_at_the_chosen_path() {
    let from = source();
    let into = TempDir::new().expect("temp directory");
    let destination = into.path().join("copy");

    Git::discover()
        .expect("git found")
        .clone_into(
            &from.path().display().to_string(),
            &destination,
            false,
            None,
            &Cancel::new(),
            &mut |_| {},
        )
        .expect("clone succeeds");

    assert!(
        destination.join(".git").exists(),
        "the clone lands exactly where it was asked to, not in the current directory"
    );
    assert!(
        destination.join("readme.md").exists(),
        "the working tree is checked out, not left empty"
    );
}

#[test]
fn a_clone_into_a_taken_path_fails_instead_of_mixing_two_repositories() {
    let from = source();
    let into = TempDir::new().expect("temp directory");
    let destination = into.path().join("taken");
    std::fs::create_dir_all(&destination).expect("directory created");
    std::fs::write(destination.join("theirs.txt"), "do not touch").expect("file written");

    let failed = Git::discover()
        .expect("git found")
        .clone_into(
            &from.path().display().to_string(),
            &destination,
            false,
            None,
            &Cancel::new(),
            &mut |_| {},
        )
        .is_err();

    assert!(failed, "git refuses to clone into a non-empty directory");
    assert!(
        destination.join("theirs.txt").exists(),
        "files that were already there stay untouched"
    );
}

#[test]
fn init_makes_a_repository_where_there_was_none() {
    let dir = TempDir::new().expect("temp directory");
    let at = dir.path().join("fresh");
    std::fs::create_dir_all(&at).expect("directory created");

    Git::discover()
        .expect("git found")
        .init(&at, None)
        .expect("repository is created");

    assert!(
        at.join(".git").exists(),
        "creating the repository is left to git, not laid out by hand"
    );
}

#[test]
fn init_names_the_first_branch_when_the_user_chose_one() {
    let dir = TempDir::new().expect("temp directory");
    let at = dir.path().join("named");
    std::fs::create_dir_all(&at).expect("directory created");

    let git = Git::discover().expect("git found");
    git.init(&at, Some("trunk")).expect("repository is created");

    let head = std::process::Command::new("git")
        .args([
            "-C",
            at.to_str().expect("path is utf-8"),
            "symbolic-ref",
            "HEAD",
        ])
        .output()
        .expect("git runs");
    assert_eq!(
        String::from_utf8_lossy(&head.stdout).trim(),
        "refs/heads/trunk",
        "the first branch name from the settings has to reach git init -b"
    );
}

#[test]
fn a_shallow_clone_brings_one_commit_of_history() {
    let from = source();
    std::fs::write(from.path().join("second.md"), "more").expect("file written");
    run(from.path(), &["add", "-A"]);
    run(from.path(), &["commit", "-m", "second"]);

    let into = TempDir::new().expect("temp directory");
    let destination = into.path().join("shallow-copy");

    Git::discover()
        .expect("git found")
        .clone_into(
            &format!("file://{}", from.path().display()),
            &destination,
            true,
            None,
            &Cancel::new(),
            &mut |_| {},
        )
        .expect("clone succeeds");

    let out = Command::new("git")
        .arg("-C")
        .arg(&destination)
        .args(["rev-list", "--count", "HEAD"])
        .output()
        .expect("git runs");
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).trim(),
        "1",
        "--depth 1 has to cut the history down to a single commit"
    );
}

#[test]
fn templates_land_in_history_as_the_first_commit() {
    let dir = TempDir::new().expect("temp directory");
    let git = Git::discover().expect("git found");
    git.init(dir.path(), Some("main")).expect("init succeeds");
    std::fs::write(dir.path().join(".gitignore"), "target/\n").expect("file written");

    run(dir.path(), &["config", "user.name", "Test"]);
    run(dir.path(), &["config", "user.email", "test@example.com"]);
    git.first_commit(dir.path(), "Initial commit")
        .expect("first commit succeeds");

    let out = Command::new("git")
        .arg("-C")
        .arg(dir.path())
        .args(["log", "--format=%s", "-1"])
        .output()
        .expect("git runs");
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).trim(),
        "Initial commit",
        "the templates land in the history instead of lying around uncommitted"
    );
}
