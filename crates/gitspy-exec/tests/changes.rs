use gitspy_exec::changes::Status;
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
        .env("GIT_AUTHOR_DATE", "1577836800 +0000")
        .env("GIT_COMMITTER_DATE", "1577836800 +0000")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn write(dir: &Path, path: &str, text: &str) {
    let full = dir.join(path);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).expect("parent directory created");
    }
    std::fs::write(full, text).expect("file written");
}

fn repo() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    dir
}

fn commit(dir: &Path, message: &str) -> String {
    run(dir, &["add", "-A"]);
    run(dir, &["commit", "-m", message]);
    run(dir, &["rev-parse", "HEAD"])
}

fn git() -> Git {
    Git::discover().expect("git found")
}

#[test]
fn an_added_file_is_reported_as_added_with_its_line_count() {
    let dir = repo();
    write(dir.path(), "a.txt", "one\ntwo\nthree\n");
    let hash = commit(dir.path(), "first");

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("commit files read");
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].status, Status::Added);
    assert_eq!(files[0].path, "a.txt");
    assert_eq!(files[0].added, Some(3));
    assert_eq!(files[0].deleted, Some(0));
}

#[test]
fn a_rename_keeps_both_paths_and_is_not_two_separate_changes() {
    let dir = repo();
    write(dir.path(), "old.txt", "line\n".repeat(20).as_str());
    commit(dir.path(), "first");

    run(dir.path(), &["mv", "old.txt", "new.txt"]);
    let hash = commit(dir.path(), "rename");

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("commit files read");
    assert_eq!(
        files.len(),
        1,
        "a rename is one change, not a deletion plus an addition"
    );
    assert_eq!(files[0].status, Status::Renamed);
    assert_eq!(files[0].old_path.as_deref(), Some("old.txt"));
    assert_eq!(files[0].path, "new.txt");
}

#[test]
fn a_binary_file_has_no_line_counts() {
    let dir = repo();
    std::fs::write(dir.path().join("logo.bin"), [0u8, 159, 146, 150, 0, 1, 2])
        .expect("binary file written");
    let hash = commit(dir.path(), "binary");

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("commit files read");
    assert_eq!(files[0].path, "logo.bin");
    assert!(
        files[0].is_binary(),
        "a binary file has no lines to count, so git reports none"
    );
}

#[test]
fn a_path_with_spaces_and_non_ascii_survives() {
    let dir = repo();
    write(dir.path(), "café dossier/résumé.txt", "text\n");
    let hash = commit(dir.path(), "path with spaces and non-ASCII");

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("commit files read");
    assert_eq!(files[0].path, "café dossier/résumé.txt");
}

#[test]
fn a_merge_is_compared_against_its_first_parent() {
    let dir = repo();
    write(dir.path(), "base.txt", "base\n");
    commit(dir.path(), "base");

    run(dir.path(), &["checkout", "-b", "side"]);
    write(dir.path(), "side.txt", "side\n");
    commit(dir.path(), "side");

    run(dir.path(), &["checkout", "main"]);
    write(dir.path(), "main.txt", "main\n");
    commit(dir.path(), "main");

    run(dir.path(), &["merge", "--no-ff", "--no-edit", "side"]);
    let hash = run(dir.path(), &["rev-parse", "HEAD"]);

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("merge commit read");
    let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(
        paths,
        vec!["side.txt"],
        "a merge shows what it brought in, not everything on the merged branch"
    );
}

#[test]
fn the_first_commit_shows_everything_it_introduced() {
    let dir = repo();
    write(dir.path(), "a.txt", "a\n");
    write(dir.path(), "b.txt", "b\n");
    let hash = commit(dir.path(), "start");

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("root commit read");
    let mut paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
    paths.sort();
    assert_eq!(paths, vec!["a.txt", "b.txt"]);
}

#[test]
fn file_contents_come_back_for_both_sides_of_a_change() {
    let dir = repo();
    write(dir.path(), "a.txt", "before\n");
    let before = commit(dir.path(), "before");
    write(dir.path(), "a.txt", "after\n");
    let after = commit(dir.path(), "after");

    let git = git();
    assert_eq!(
        git.file_at(dir.path(), &before, "a.txt")
            .expect("old side read"),
        "before"
    );
    assert_eq!(
        git.file_at(dir.path(), &after, "a.txt")
            .expect("new side read"),
        "after"
    );
}

#[test]
fn a_file_that_did_not_exist_yet_reads_as_empty_rather_than_failing() {
    let dir = repo();
    write(dir.path(), "a.txt", "a\n");
    let first = commit(dir.path(), "first");
    write(dir.path(), "b.txt", "b\n");
    commit(dir.path(), "second");

    let text = git()
        .file_at(dir.path(), &first, "b.txt")
        .expect("a missing path is emptiness, not an error");
    assert_eq!(text, "", "an added file has no old side");
}
