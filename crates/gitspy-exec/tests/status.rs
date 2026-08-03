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

#[test]
fn an_unstaged_change_compares_the_index_with_the_disk() {
    let dir = repo();
    write(dir.path(), "base.txt", "новое содержимое\n");

    let (before, after) = git()
        .working_tree_sides(dir.path(), "base.txt", false)
        .expect("стороны читаются");
    assert_eq!(before.trim(), "основа", "слева то, что в индексе");
    assert_eq!(after.trim(), "новое содержимое", "справа то, что на диске");
}

#[test]
fn a_staged_change_compares_head_with_the_index() {
    let dir = repo();
    write(dir.path(), "base.txt", "проиндексировано\n");
    run(dir.path(), &["add", "base.txt"]);
    write(dir.path(), "base.txt", "и правлено дальше\n");

    let (before, after) = git()
        .working_tree_sides(dir.path(), "base.txt", true)
        .expect("стороны читаются");
    assert_eq!(before.trim(), "основа", "слева HEAD");
    assert_eq!(after.trim(), "проиндексировано", "справа индекс, а не диск");
}

#[test]
fn a_new_untracked_file_has_an_empty_left_side() {
    let dir = repo();
    write(dir.path(), "новый.txt", "содержимое\n");

    let (before, after) = git()
        .working_tree_sides(dir.path(), "новый.txt", false)
        .expect("стороны читаются");
    assert_eq!(before, "", "у нового файла нет старой стороны");
    assert_eq!(after.trim(), "содержимое");
}

#[test]
fn a_branch_without_an_upstream_says_so_rather_than_guessing_origin() {
    let dir = repo();
    let tree = git().status(dir.path()).expect("статус читается");
    assert_eq!(
        tree.upstream, None,
        "без этого push ушёл бы в несуществующий upstream и упал"
    );
}

#[test]
fn an_upstream_is_read_with_its_remote() {
    let dir = repo();
    let bare = TempDir::new().expect("временный каталог");
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

    let tree = git().status(dir.path()).expect("статус читается");
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
    let bare = TempDir::new().expect("временный каталог");
    run(bare.path(), &["init", "--bare"]);
    let url = bare.path().display().to_string();
    run(dir.path(), &["remote", "add", "origin", &url]);
    run(dir.path(), &["remote", "add", "backup", &url]);

    assert_eq!(git().remotes(dir.path()), vec!["backup", "origin"]);
}

#[test]
fn remote_addresses_come_with_their_names_and_without_duplicates() {
    let dir = repo();
    let bare = TempDir::new().expect("временный каталог");
    run(bare.path(), &["init", "--bare"]);
    let url = bare.path().display().to_string();
    run(dir.path(), &["remote", "add", "origin", &url]);

    let found = git().remote_urls(dir.path());
    assert_eq!(
        found,
        vec![("origin".to_string(), url)],
        "fetch и push дают origin дважды, а нам нужен один раз"
    );
}
