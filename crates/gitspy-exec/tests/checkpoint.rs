use gitspy_exec::checkpoint::{checkpoint_create, checkpoint_pin, checkpoint_restore};
use gitspy_exec::Git;
use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

const NAME: &str = "Test Author";
const EMAIL: &str = "test@example.com";
const DATE: &str = "1577836800 +0000";

fn prepared(dir: &Path, args: &[&str]) -> Command {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .env("GIT_AUTHOR_NAME", NAME)
        .env("GIT_AUTHOR_EMAIL", EMAIL)
        .env("GIT_COMMITTER_NAME", NAME)
        .env("GIT_COMMITTER_EMAIL", EMAIL)
        .env("GIT_AUTHOR_DATE", DATE)
        .env("GIT_COMMITTER_DATE", DATE);
    command
}

fn git(dir: &Path, args: &[&str]) {
    let out = prepared(dir, args).output().expect("git запускается");
    assert!(
        out.status.success(),
        "git {args:?} обязан пройти: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

fn ask(dir: &Path, args: &[&str]) -> String {
    let out = prepared(dir, args).output().expect("git запускается");
    assert!(
        out.status.success(),
        "git {args:?} обязан пройти: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn repo() -> TempDir {
    let dir = TempDir::new().expect("временный каталог");
    git(dir.path(), &["init", "-q", "-b", "main"]);
    git(dir.path(), &["commit", "--allow-empty", "-q", "-m", "base"]);
    fs::write(dir.path().join("a.txt"), "исходное").expect("файл пишется");
    git(dir.path(), &["add", "a.txt"]);
    git(dir.path(), &["commit", "-q", "-m", "a"]);
    dir
}

#[test]
fn clean_tree_gives_no_checkpoint() {
    let dir = repo();
    assert_eq!(
        checkpoint_create(dir.path()).expect("вызов проходит"),
        None,
        "чистое дерево — чекпоинта нет"
    );
}

#[test]
fn dirty_tree_checkpoint_restores_content() {
    let dir = repo();
    fs::write(dir.path().join("a.txt"), "правка до агента").expect("файл пишется");
    let oid = checkpoint_create(dir.path())
        .expect("вызов проходит")
        .expect("грязное дерево даёт oid");
    checkpoint_pin(dir.path(), "s1", 1, &oid).expect("ссылка ставится");
    fs::write(dir.path().join("a.txt"), "агент сломал").expect("файл пишется");
    checkpoint_restore(dir.path(), Some(&oid), &["a.txt".into()]).expect("откат проходит");
    assert_eq!(
        fs::read_to_string(dir.path().join("a.txt")).expect("файл читается"),
        "правка до агента",
        "откат возвращает состояние на момент чекпоинта"
    );
}

#[test]
fn restore_of_agent_created_file_deletes_it() {
    let dir = repo();
    fs::write(dir.path().join("new.txt"), "создал агент").expect("файл пишется");
    checkpoint_restore(dir.path(), None, &["new.txt".into()]).expect("откат проходит");
    assert!(
        !dir.path().join("new.txt").exists(),
        "созданный агентом файл удаляется откатом"
    );
}

#[test]
fn a_file_created_after_the_checkpoint_is_deleted_instead_of_failing_the_rollback() {
    let dir = repo();
    fs::write(dir.path().join("a.txt"), "правка до агента").expect("файл пишется");
    let oid = checkpoint_create(dir.path())
        .expect("вызов проходит")
        .expect("грязное дерево даёт oid");
    fs::write(dir.path().join("a.txt"), "агент сломал").expect("файл пишется");
    fs::write(dir.path().join("new.txt"), "создал агент").expect("файл пишется");

    checkpoint_restore(dir.path(), Some(&oid), &["a.txt".into(), "new.txt".into()])
        .expect("откат проходит целиком, а не до первого незнакомого пути");

    assert_eq!(
        fs::read_to_string(dir.path().join("a.txt")).expect("файл читается"),
        "правка до агента",
        "известный снапшоту путь возвращается из него"
    );
    assert!(
        !dir.path().join("new.txt").exists(),
        "пути, которого в снапшоте нет, до агента не существовало — откат его удаляет"
    );
}

#[test]
fn a_pinned_checkpoint_is_found_by_its_ref_and_stays_out_of_the_graph() {
    let dir = repo();
    fs::write(dir.path().join("a.txt"), "правка до агента").expect("файл пишется");
    let oid = checkpoint_create(dir.path())
        .expect("вызов проходит")
        .expect("грязное дерево даёт oid");
    checkpoint_pin(dir.path(), "s1", 1, &oid).expect("ссылка ставится");

    assert_eq!(
        ask(dir.path(), &["rev-parse", "refs/gitspy/checkpoints/s1/1"]),
        oid,
        "без ссылки снапшот некому держать: сборщик мусора уносит его вместе с возможностью отката"
    );

    let shown = Git::discover()
        .expect("git найден")
        .refs(dir.path())
        .expect("ссылки читаются");
    assert!(
        !shown
            .iter()
            .any(|line| line.full_name.starts_with("refs/gitspy/")),
        "служебной ссылке чекпоинта не место среди веток и тегов: {:?}",
        shown.iter().map(|line| &line.full_name).collect::<Vec<_>>()
    );
}
