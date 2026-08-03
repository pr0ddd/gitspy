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
        .expect("git запускается");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

fn source() -> TempDir {
    let dir = TempDir::new().expect("временный каталог");
    run(dir.path(), &["init", "-b", "main"]);
    std::fs::write(dir.path().join("readme.md"), "привет").expect("файл пишется");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "первый"]);
    dir
}

#[test]
fn a_clone_leaves_a_working_repository_at_the_chosen_path() {
    let from = source();
    let into = TempDir::new().expect("временный каталог");
    let destination = into.path().join("копия");

    Git::discover()
        .expect("git найден")
        .clone_into(
            &from.path().display().to_string(),
            &destination,
            None,
            &Cancel::new(),
            &mut |_| {},
        )
        .expect("клонирование проходит");

    assert!(
        destination.join(".git").exists(),
        "клон кладётся ровно туда, куда попросили, а не в текущий каталог"
    );
    assert!(
        destination.join("readme.md").exists(),
        "рабочее дерево разложено, а не оставлено пустым"
    );
}

#[test]
fn a_clone_into_a_taken_path_fails_instead_of_mixing_two_repositories() {
    let from = source();
    let into = TempDir::new().expect("временный каталог");
    let destination = into.path().join("занято");
    std::fs::create_dir_all(&destination).expect("каталог");
    std::fs::write(destination.join("своё.txt"), "не трогать").expect("файл пишется");

    let failed = Git::discover()
        .expect("git найден")
        .clone_into(
            &from.path().display().to_string(),
            &destination,
            None,
            &Cancel::new(),
            &mut |_| {},
        )
        .is_err();

    assert!(failed, "git отказывается клонировать в непустую папку");
    assert!(
        destination.join("своё.txt").exists(),
        "чужие файлы остаются на месте"
    );
}

#[test]
fn init_makes_a_repository_where_there_was_none() {
    let dir = TempDir::new().expect("временный каталог");
    let at = dir.path().join("новый");
    std::fs::create_dir_all(&at).expect("каталог");

    Git::discover()
        .expect("git найден")
        .init(&at)
        .expect("репозиторий создаётся");

    assert!(
        at.join(".git").exists(),
        "создание отдаётся git, а не выкладывается нами руками"
    );
}
