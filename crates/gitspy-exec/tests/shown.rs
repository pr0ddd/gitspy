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
        .expect("git запускается")
        .success();
    assert!(ok, "подготовка фикстуры: git {args:?}");
}

fn repo_with_a_commit() -> TempDir {
    let dir = TempDir::new().expect("временный каталог");
    run(dir.path(), &["init", "-b", "main"]);
    std::fs::write(dir.path().join("a.txt"), "hi\n").expect("файл");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-q", "-m", "one"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git найден")
}

#[test]
fn a_path_missing_from_the_ref_reads_as_empty() {
    let dir = repo_with_a_commit();
    let text = git()
        .file_at(dir.path(), "HEAD", "missing.txt")
        .expect("отсутствие файла в ревизии — не ошибка, а пустая сторона диффа");
    assert_eq!(text, "");
}

#[test]
fn a_broken_git_config_surfaces_as_an_error_not_as_an_empty_file() {
    let dir = repo_with_a_commit();
    let config = dir.path().join(".git").join("config");
    let mut text = std::fs::read_to_string(&config).expect("конфиг читается");
    text.push_str("[gpg\n");
    std::fs::write(&config, text).expect("конфиг пишется");

    assert!(
        git().file_at(dir.path(), "HEAD", "a.txt").is_err(),
        "git отказал не из-за отсутствия файла — пустой дифф скрыл бы поломку, как это было с битым gpg.format"
    );
}
