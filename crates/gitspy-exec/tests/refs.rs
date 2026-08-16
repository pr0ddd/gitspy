use gitspy_exec::refs::RefKind;
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

fn repo() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    write(dir.path(), "base.txt", "base\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "start"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git found")
}

fn named<'a>(
    found: &'a [gitspy_exec::refs::RefLine],
    name: &str,
) -> &'a gitspy_exec::refs::RefLine {
    found
        .iter()
        .find(|r| r.name == name)
        .unwrap_or_else(|| panic!("ref {name} not found"))
}

#[test]
fn only_the_checked_out_branch_is_marked_head() {
    let dir = repo();
    run(dir.path(), &["branch", "other"]);

    let found = git().refs(dir.path()).expect("refs read");
    let marked: Vec<&str> = found
        .iter()
        .filter(|r| r.is_head)
        .map(|r| r.name.as_str())
        .collect();

    assert_eq!(
        marked,
        ["main"],
        "two branches on one commit: exactly one of them may be marked as HEAD"
    );
}

#[test]
fn detached_head_marks_nothing() {
    let dir = repo();
    run(dir.path(), &["checkout", "--detach"]);

    let found = git().refs(dir.path()).expect("refs read");

    assert!(
        !found.iter().any(|r| r.is_head),
        "with a detached HEAD no branch is checked out, so none may be marked"
    );
}

#[test]
fn an_annotated_tag_resolves_to_its_commit() {
    let dir = repo();
    run(dir.path(), &["tag", "-a", "heavy", "-m", "annotation"]);

    let head = git().head_oid(dir.path()).expect("HEAD exists");
    let found = git().refs(dir.path()).expect("refs read");

    assert_eq!(
        named(&found, "heavy").oid,
        head,
        "a tag must point at the commit, not at the tag object"
    );
}

#[test]
fn a_tag_pointing_at_a_blob_does_not_break_the_read() {
    let dir = repo();
    write(dir.path(), "loose.txt", "just some contents\n");
    let blob = run(dir.path(), &["hash-object", "-w", "loose.txt"]);
    run(
        dir.path(),
        &["tag", "-a", "onblob", "-m", "annotation", &blob],
    );

    let found = git().refs(dir.path()).expect("refs read");

    assert!(
        !found.iter().any(|r| r.name == "onblob"),
        "git log --all skips such refs silently, and so must we"
    );
    assert!(
        found.iter().any(|r| r.name == "main"),
        "one unusable ref does not cancel the rest"
    );
}

#[test]
fn every_stash_entry_is_visible_not_just_the_top() {
    let dir = repo();
    for text in ["second\n", "third\n"] {
        write(dir.path(), "base.txt", text);
        run(dir.path(), &["stash"]);
    }

    let found = git().refs(dir.path()).expect("refs read");
    let stashes: Vec<&str> = found
        .iter()
        .filter(|r| r.kind == RefKind::Stash)
        .map(|r| r.name.as_str())
        .collect();

    assert_eq!(
        stashes,
        ["stash@{0}", "stash@{1}"],
        "refs/stash points only at the top entry, the rest live in its reflog"
    );
}

#[test]
fn a_repository_without_stashes_still_reads() {
    let dir = repo();

    let found = git().refs(dir.path()).expect("refs read");

    assert!(
        found.iter().all(|r| r.kind != RefKind::Stash),
        "an empty stash list must not turn into a single empty entry"
    );
}

fn diverged() -> (TempDir, std::path::PathBuf) {
    let holder = TempDir::new().expect("temp directory");
    let upstream = holder.path().join("upstream");
    let clone = holder.path().join("clone");

    std::fs::create_dir(&upstream).expect("directory for the upstream");
    run(&upstream, &["init", "-b", "main"]);
    write(&upstream, "base.txt", "base\n");
    run(&upstream, &["add", "-A"]);
    run(&upstream, &["commit", "-m", "start"]);

    run(
        holder.path(),
        &["clone", upstream.to_str().expect("path is utf-8"), "clone"],
    );

    write(&upstream, "base.txt", "work done on the server\n");
    run(&upstream, &["commit", "-am", "someone else's work"]);

    write(&clone, "mine.txt", "my work\n");
    run(&clone, &["add", "-A"]);
    run(&clone, &["commit", "-m", "my work"]);
    run(&clone, &["fetch"]);

    (holder, clone)
}

#[test]
fn tracking_counts_match_what_git_itself_reports() {
    let (_holder, clone) = diverged();

    let found = git().refs(&clone).expect("refs read");
    let main = named(&found, "main");

    let counted = run(
        &clone,
        &["rev-list", "--left-right", "--count", "main...origin/main"],
    );
    let mut numbers = counted.split_whitespace();
    let ahead: u32 = numbers
        .next()
        .expect("ahead present")
        .parse()
        .expect("a number");
    let behind: u32 = numbers
        .next()
        .expect("behind present")
        .parse()
        .expect("a number");

    assert!(
        ahead > 0 && behind > 0,
        "the fixture must diverge in both directions: with zeroes this test would pass even for a parser that always returns zeroes"
    );
    assert_eq!(
        (main.ahead, main.behind),
        (ahead, behind),
        "the ahead/behind counts must match what git itself answers"
    );
    assert_eq!(main.upstream.as_deref(), Some("origin/main"));
}

#[test]
fn an_upstream_that_disappeared_is_reported_as_gone_not_as_zeroes() {
    let (_holder, clone) = diverged();
    run(&clone, &["update-ref", "-d", "refs/remotes/origin/main"]);

    let found = git().refs(&clone).expect("refs read");

    assert!(
        named(&found, "main").gone,
        "zeroes would mean \"compared and equal\", but there is nothing left to compare against"
    );
}
