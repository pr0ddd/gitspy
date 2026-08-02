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
        .expect("git запускается");
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn write(dir: &Path, path: &str, text: &str) {
    let full = dir.join(path);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).expect("каталог");
    }
    std::fs::write(full, text).expect("файл");
}

fn repo() -> TempDir {
    let dir = TempDir::new().expect("временный каталог");
    run(dir.path(), &["init", "-b", "main"]);
    write(dir.path(), "base.txt", "основа\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "начало"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git найден")
}

#[test]
fn a_clean_tree_is_not_dirty() {
    let dir = repo();
    let tree = git().status(dir.path()).expect("статус читается");
    assert!(!tree.is_dirty());
    assert_eq!(tree.branch.as_deref(), Some("main"));
}

#[test]
fn an_edited_file_is_unstaged_until_it_is_added() {
    let dir = repo();
    write(dir.path(), "base.txt", "изменено\n");

    let tree = git().status(dir.path()).expect("статус читается");
    assert_eq!(tree.unstaged(), 1);
    assert_eq!(tree.staged(), 0);

    run(dir.path(), &["add", "base.txt"]);
    let tree = git().status(dir.path()).expect("статус читается");
    assert_eq!(tree.staged(), 1);
    assert_eq!(tree.unstaged(), 0);
}

#[test]
fn a_file_changed_after_staging_shows_on_both_sides() {
    let dir = repo();
    write(dir.path(), "base.txt", "первое\n");
    run(dir.path(), &["add", "base.txt"]);
    write(dir.path(), "base.txt", "второе\n");

    let tree = git().status(dir.path()).expect("статус читается");
    assert_eq!(tree.staged(), 1, "в индексе одно");
    assert_eq!(tree.unstaged(), 1, "в дереве другое");
}

#[test]
fn an_untracked_file_appears_with_its_real_name() {
    let dir = repo();
    write(dir.path(), "папка/новый файл.txt", "текст\n");

    let tree = git().status(dir.path()).expect("статус читается");
    let entry = tree
        .entries
        .iter()
        .find(|e| e.letter == '?')
        .expect("неотслеживаемый найден");
    assert_eq!(entry.path, "папка/новый файл.txt");
    assert_eq!(entry.side, Side::Unstaged);
}

#[test]
fn an_ignored_file_does_not_show_up() {
    let dir = repo();
    write(dir.path(), ".gitignore", "секрет.txt\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "игноры"]);
    write(dir.path(), "секрет.txt", "не показывать\n");

    let tree = git().status(dir.path()).expect("статус читается");
    assert!(
        !tree.entries.iter().any(|e| e.path == "секрет.txt"),
        "игнорируемое не показываем: это знает только git"
    );
}

#[test]
fn a_staged_rename_keeps_both_paths() {
    let dir = repo();
    write(dir.path(), "old.txt", "строка\n".repeat(20).as_str());
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "файл"]);

    run(dir.path(), &["mv", "old.txt", "new.txt"]);
    let tree = git().status(dir.path()).expect("статус читается");

    let entry = tree
        .entries
        .iter()
        .find(|e| e.side == Side::Staged)
        .expect("переименование в индексе");
    assert_eq!(entry.path, "new.txt");
    assert_eq!(entry.old_path.as_deref(), Some("old.txt"));
}

#[test]
fn a_conflict_is_visible_as_unmerged() {
    let dir = repo();
    run(dir.path(), &["checkout", "-b", "side"]);
    write(dir.path(), "base.txt", "боковая версия\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "боковая"]);

    run(dir.path(), &["checkout", "main"]);
    write(dir.path(), "base.txt", "основная версия\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "основная"]);

    run(dir.path(), &["merge", "side"]);

    let tree = git().status(dir.path()).expect("статус читается");
    assert!(
        tree.entries.iter().any(|e| e.letter == 'U'),
        "конфликт обязан быть виден отдельно: {:?}",
        tree.entries
    );
}

#[test]
fn divergence_from_the_upstream_is_reported() {
    let dir = repo();
    let (_remote_dir, remote) = {
        let remote = TempDir::new().expect("удалённый каталог");
        run(remote.path(), &["init", "--bare", "-b", "main"]);
        let path = remote.path().to_path_buf();
        (remote, path)
    };

    run(
        dir.path(),
        &["remote", "add", "origin", remote.to_str().expect("путь")],
    );
    run(dir.path(), &["push", "-u", "origin", "main"]);
    write(dir.path(), "base.txt", "ещё\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "второй"]);

    let tree = git().status(dir.path()).expect("статус читается");
    assert_eq!(tree.ahead, 1, "один коммит впереди удалённой ветки");
    assert_eq!(tree.behind, 0);
}
