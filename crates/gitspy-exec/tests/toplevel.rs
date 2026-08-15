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

fn repo() -> TempDir {
    let dir = TempDir::new().expect("временный каталог");
    run(dir.path(), &["init", "-b", "main"]);
    std::fs::create_dir_all(dir.path().join("src/deep")).expect("вложенный каталог");
    std::fs::write(dir.path().join("src/deep/a.txt"), "a\n").expect("файл");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "start"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git найден")
}

fn canonical(path: &Path) -> String {
    path.canonicalize()
        .expect("путь существует")
        .to_string_lossy()
        .into_owned()
}

#[test]
fn a_dropped_subfolder_resolves_to_the_repository_root() {
    let dir = repo();
    let root = git()
        .toplevel(&dir.path().join("src/deep"))
        .expect("корень находится");
    assert_eq!(
        root.map(|p| canonical(&p)),
        Some(canonical(dir.path())),
        "бросают что угодно внутри репозитория — открывать надо сам репозиторий"
    );
}

#[test]
fn a_dropped_file_resolves_to_its_repository_root_too() {
    let dir = repo();
    let root = git()
        .toplevel(&dir.path().join("src/deep/a.txt"))
        .expect("корень находится");
    assert_eq!(root.map(|p| canonical(&p)), Some(canonical(dir.path())));
}

#[test]
fn a_folder_outside_any_repository_resolves_to_nothing() {
    let dir = TempDir::new().expect("временный каталог");
    let root = git()
        .toplevel(dir.path())
        .expect("отсутствие корня — не ошибка");
    assert_eq!(
        root, None,
        "не репозиторий — не открывать, а честно сказать"
    );
}
