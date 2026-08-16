use gitspy_exec::status::Side;
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
    let full = dir.join(path);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).expect("parent directory created");
    }
    std::fs::write(full, text).expect("file written");
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

#[test]
fn a_clean_tree_is_not_dirty() {
    let dir = repo();
    let tree = git().status(dir.path()).expect("status read");
    assert!(!tree.is_dirty());
    assert_eq!(tree.branch.as_deref(), Some("main"));
}

#[test]
fn an_edited_file_is_unstaged_until_it_is_added() {
    let dir = repo();
    write(dir.path(), "base.txt", "edited\n");

    let tree = git().status(dir.path()).expect("status read");
    assert_eq!(tree.unstaged(), 1);
    assert_eq!(tree.staged(), 0);

    run(dir.path(), &["add", "base.txt"]);
    let tree = git().status(dir.path()).expect("status read");
    assert_eq!(tree.staged(), 1);
    assert_eq!(tree.unstaged(), 0);
}

#[test]
fn a_file_changed_after_staging_shows_on_both_sides() {
    let dir = repo();
    write(dir.path(), "base.txt", "first\n");
    run(dir.path(), &["add", "base.txt"]);
    write(dir.path(), "base.txt", "second\n");

    let tree = git().status(dir.path()).expect("status read");
    assert_eq!(tree.staged(), 1, "the index holds one version");
    assert_eq!(tree.unstaged(), 1, "the working tree holds another one");
}

#[test]
fn an_untracked_file_appears_with_its_real_name() {
    let dir = repo();
    write(dir.path(), "café/nouveau fichier.txt", "text\n");

    let tree = git().status(dir.path()).expect("status read");
    let entry = tree
        .entries
        .iter()
        .find(|e| e.letter == '?')
        .expect("the untracked entry with a non-ASCII path is found");
    assert_eq!(entry.path, "café/nouveau fichier.txt");
    assert_eq!(entry.side, Side::Unstaged);
}

#[test]
fn an_ignored_file_does_not_show_up() {
    let dir = repo();
    write(dir.path(), ".gitignore", "secret.txt\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "ignores"]);
    write(dir.path(), "secret.txt", "do not show\n");

    let tree = git().status(dir.path()).expect("status read");
    assert!(
        !tree.entries.iter().any(|e| e.path == "secret.txt"),
        "ignored files are not shown, and only git knows which ones they are"
    );
}

#[test]
fn a_staged_rename_keeps_both_paths() {
    let dir = repo();
    write(dir.path(), "old.txt", "line\n".repeat(20).as_str());
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "file"]);

    run(dir.path(), &["mv", "old.txt", "new.txt"]);
    let tree = git().status(dir.path()).expect("status read");

    let entry = tree
        .entries
        .iter()
        .find(|e| e.side == Side::Staged)
        .expect("the rename is in the index");
    assert_eq!(entry.path, "new.txt");
    assert_eq!(entry.old_path.as_deref(), Some("old.txt"));
}

#[test]
fn a_conflict_is_visible_as_unmerged() {
    let dir = repo();
    run(dir.path(), &["checkout", "-b", "side"]);
    write(dir.path(), "base.txt", "side version\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "side"]);

    run(dir.path(), &["checkout", "main"]);
    write(dir.path(), "base.txt", "main version\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "main"]);

    run(dir.path(), &["merge", "side"]);

    let tree = git().status(dir.path()).expect("status read");
    assert!(
        tree.entries.iter().any(|e| e.letter == 'U'),
        "a conflict must be visible on its own: {:?}",
        tree.entries
    );
}

#[test]
fn divergence_from_the_upstream_is_reported() {
    let dir = repo();
    let (_remote_dir, remote) = {
        let remote = TempDir::new().expect("directory for the remote");
        run(remote.path(), &["init", "--bare", "-b", "main"]);
        let path = remote.path().to_path_buf();
        (remote, path)
    };

    run(
        dir.path(),
        &["remote", "add", "origin", remote.to_str().expect("path")],
    );
    run(dir.path(), &["push", "-u", "origin", "main"]);
    write(dir.path(), "base.txt", "more\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "second"]);

    let tree = git().status(dir.path()).expect("status read");
    assert_eq!(tree.ahead, 1, "one commit ahead of the remote branch");
    assert_eq!(tree.behind, 0);
}

#[test]
fn an_unstaged_change_compares_the_index_with_the_disk() {
    let dir = repo();
    write(dir.path(), "base.txt", "new contents\n");

    let (before, after) = git()
        .working_tree_sides(dir.path(), "base.txt", false)
        .expect("both sides read");
    assert_eq!(
        before.trim(),
        "base",
        "the left side is what the index holds"
    );
    assert_eq!(
        after.trim(),
        "new contents",
        "the right side is what is on disk"
    );
}

#[test]
fn a_staged_change_compares_head_with_the_index() {
    let dir = repo();
    write(dir.path(), "base.txt", "staged text\n");
    run(dir.path(), &["add", "base.txt"]);
    write(dir.path(), "base.txt", "and edited further\n");

    let (before, after) = git()
        .working_tree_sides(dir.path(), "base.txt", true)
        .expect("both sides read");
    assert_eq!(before.trim(), "base", "the left side is HEAD");
    assert_eq!(
        after.trim(),
        "staged text",
        "the right side is the index, not the disk"
    );
}

#[test]
fn a_new_untracked_file_has_an_empty_left_side() {
    let dir = repo();
    write(dir.path(), "new.txt", "contents\n");

    let (before, after) = git()
        .working_tree_sides(dir.path(), "new.txt", false)
        .expect("both sides read");
    assert_eq!(before, "", "a new file has no old side");
    assert_eq!(after.trim(), "contents");
}

#[test]
fn a_branch_without_an_upstream_says_so_rather_than_guessing_origin() {
    let dir = repo();
    let tree = git().status(dir.path()).expect("status read");
    assert_eq!(
        tree.upstream, None,
        "without this push would go to an upstream that does not exist and fail"
    );
}

#[test]
fn an_upstream_is_read_with_its_remote() {
    let dir = repo();
    let bare = TempDir::new().expect("temp directory");
    run(bare.path(), &["init", "--bare"]);
    run(
        dir.path(),
        &[
            "remote",
            "add",
            "origin",
            &bare.path().display().to_string(),
        ],
    );
    run(dir.path(), &["push", "-u", "origin", "main"]);

    let tree = git().status(dir.path()).expect("status read");
    assert_eq!(tree.upstream.as_deref(), Some("origin/main"));
}

#[test]
fn a_repository_without_remotes_offers_none_instead_of_assuming_origin() {
    let dir = repo();
    assert!(git().remotes(dir.path()).is_empty());
}

#[test]
fn every_added_remote_is_offered_by_name() {
    let dir = repo();
    let bare = TempDir::new().expect("temp directory");
    run(bare.path(), &["init", "--bare"]);
    let url = bare.path().display().to_string();
    run(dir.path(), &["remote", "add", "origin", &url]);
    run(dir.path(), &["remote", "add", "backup", &url]);

    assert_eq!(git().remotes(dir.path()), vec!["backup", "origin"]);
}

#[test]
fn remote_addresses_come_with_their_names_and_without_duplicates() {
    let dir = repo();
    let bare = TempDir::new().expect("temp directory");
    run(bare.path(), &["init", "--bare"]);
    let url = bare.path().display().to_string();
    run(dir.path(), &["remote", "add", "origin", &url]);

    let found = git().remote_urls(dir.path());
    assert_eq!(
        found,
        vec![("origin".to_string(), url)],
        "fetch and push report origin twice, and we need it once"
    );
}

#[test]
fn the_sides_of_a_gitlink_are_the_commit_pointers_git_itself_reports() {
    let dir = repo();
    let sub = dir.path().join("inner");
    std::fs::create_dir_all(&sub).expect("directory for the subrepo");
    run(&sub, &["init", "-b", "main"]);
    write(&sub, "a.txt", "one\n");
    run(&sub, &["add", "-A"]);
    run(&sub, &["commit", "-m", "first"]);
    run(dir.path(), &["add", "inner"]);
    run(dir.path(), &["commit", "-m", "link"]);
    let before = run(&sub, &["rev-parse", "HEAD"]);

    write(&sub, "a.txt", "two\n");
    run(&sub, &["commit", "-am", "second"]);
    let after = run(&sub, &["rev-parse", "HEAD"]);

    let (old, new) = git()
        .working_tree_sides(dir.path(), "inner", false)
        .expect("both sides of the gitlink read");
    assert_eq!(
        old.trim(),
        format!("Subproject commit {before}"),
        "empty sides would draw an empty diff, while git says which commit it was"
    );
    assert_eq!(new.trim(), format!("Subproject commit {after}"));
}

#[test]
fn a_dirty_subrepo_shows_the_dirty_pointer_exactly_as_git_diff_prints_it() {
    let dir = repo();
    let sub = dir.path().join("inner");
    std::fs::create_dir_all(&sub).expect("directory for the subrepo");
    run(&sub, &["init", "-b", "main"]);
    write(&sub, "a.txt", "one\n");
    run(&sub, &["add", "-A"]);
    run(&sub, &["commit", "-m", "first"]);
    run(dir.path(), &["add", "inner"]);
    run(dir.path(), &["commit", "-m", "link"]);
    let pinned = run(&sub, &["rev-parse", "HEAD"]);

    write(&sub, "a.txt", "dirty\n");

    let (old, new) = git()
        .working_tree_sides(dir.path(), "inner", false)
        .expect("both sides of the gitlink read");
    assert_eq!(old.trim(), format!("Subproject commit {pinned}"));
    assert_eq!(
        new.trim(),
        format!("Subproject commit {pinned}-dirty"),
        "otherwise the sides are equal and the diff is empty, while git counts the file as changed"
    );
}

#[test]
fn saving_a_file_from_the_editor_lands_on_disk_without_touching_the_index() {
    let dir = repo();
    write(dir.path(), "base.txt", "an edit\n");

    git()
        .write_file(dir.path(), "base.txt", "saved from the editor\n")
        .expect("the file is written");

    assert_eq!(
        std::fs::read_to_string(dir.path().join("base.txt")).expect("file read"),
        "saved from the editor\n"
    );
    let tree = git().status(dir.path()).expect("status read");
    assert_eq!(
        tree.staged(),
        0,
        "saving is not staging, the index is left alone"
    );
    assert_eq!(tree.unstaged(), 1);
}
