use gitspy_exec::{Cancel, Event, Git};
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn repo() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    for args in [
        vec!["init", "-b", "main"],
        vec!["config", "user.name", "Test"],
        vec!["config", "user.email", "test@example.com"],
        vec!["commit", "--allow-empty", "-m", "start"],
    ] {
        let ok = Command::new("git")
            .arg("-C")
            .arg(dir.path())
            .args(&args)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .env("GIT_AUTHOR_NAME", "Test")
            .env("GIT_AUTHOR_EMAIL", "test@example.com")
            .env("GIT_COMMITTER_NAME", "Test")
            .env("GIT_COMMITTER_EMAIL", "test@example.com")
            .status()
            .expect("git runs")
            .success();
        assert!(ok, "git {args:?} failed");
    }
    dir
}

fn git() -> Git {
    Git::discover().expect("git found")
}

#[test]
fn a_missing_git_is_reported_and_not_a_panic() {
    let error = Git::at(Path::new("/nonexistent/git")).expect_err("there is no git at that path");
    assert_eq!(error.code(), "exec.gitNotFound");
}

#[test]
fn a_successful_run_reports_start_output_and_finish() {
    let dir = repo();
    let mut seen = Vec::new();
    let outcome = git()
        .run(
            dir.path(),
            &["rev-parse", "--abbrev-ref", "HEAD"],
            &Cancel::new(),
            &mut |e| seen.push(e),
        )
        .expect("the command ran");

    assert_eq!(outcome.stdout.trim(), "main");
    assert!(
        matches!(seen.first(), Some(Event::Started { .. })),
        "{seen:?}"
    );
    assert!(
        matches!(seen.last(), Some(Event::Finished { code: 0 })),
        "{seen:?}"
    );
    assert!(
        seen.iter()
            .any(|e| matches!(e, Event::Line { stderr: false, text } if text == "main")),
        "the output must arrive line by line: {seen:?}"
    );
}

#[test]
fn a_failed_run_carries_the_code_and_what_git_said() {
    let dir = repo();
    let error = git()
        .run(
            dir.path(),
            &["rev-parse", "--verify", "no-such-ref"],
            &Cancel::new(),
            &mut |_| {},
        )
        .expect_err("there is no such ref");

    assert_eq!(error.code(), "exec.failed");
    assert!(
        error.detail().is_some(),
        "what git complained about must reach the caller"
    );
}

#[test]
fn asking_for_credentials_fails_instead_of_hanging_forever() {
    let dir = repo();
    let started = std::time::Instant::now();

    let error = git()
        .run(
            dir.path(),
            &["fetch", "https://gitspy.invalid/private.git"],
            &Cancel::new(),
            &mut |_| {},
        )
        .expect_err("the address does not exist");

    assert_eq!(error.code(), "exec.failed");
    assert!(
        started.elapsed() < std::time::Duration::from_secs(30),
        "a credentials prompt must fail instead of waiting for a human at a terminal"
    );
}

#[test]
fn the_repository_of_the_process_does_not_leak_into_the_operation() {
    let dir = repo();
    let outer = TempDir::new().expect("second directory");

    std::env::set_var("GIT_DIR", outer.path());
    let outcome = git().run(
        dir.path(),
        &["rev-parse", "--git-dir"],
        &Cancel::new(),
        &mut |_| {},
    );
    std::env::remove_var("GIT_DIR");

    let outcome = outcome.expect("the command ran");
    assert!(
        !outcome
            .stdout
            .contains(outer.path().to_str().expect("path")),
        "the operation went into the wrong repository: {}",
        outcome.stdout
    );
}

#[test]
fn commit_graph_write_is_the_safe_operation_that_proves_the_shape() {
    let dir = repo();
    let outcome = git()
        .run(
            dir.path(),
            &["commit-graph", "write", "--reachable"],
            &Cancel::new(),
            &mut |_| {},
        )
        .expect("writing the commit-graph succeeds");

    assert_eq!(outcome.code, 0);
    let index = dir.path().join(".git/objects/info/commit-graph");
    assert!(index.exists(), "the commit-graph must appear on disk");
}

#[test]
fn a_cancelled_run_reports_cancellation() {
    let dir = repo();
    let cancel = Cancel::new();
    cancel.ask();

    let error = git()
        .run(dir.path(), &["rev-parse", "HEAD"], &cancel, &mut |_| {})
        .expect_err("cancelled before it finished");
    assert_eq!(error.code(), "exec.cancelled");
}
