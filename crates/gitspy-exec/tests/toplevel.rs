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

fn repo() -> TempDir {
    let dir = TempDir::new().expect("temp directory");
    run(dir.path(), &["init", "-b", "main"]);
    std::fs::create_dir_all(dir.path().join("src/deep")).expect("nested directory");
    std::fs::write(dir.path().join("src/deep/a.txt"), "a\n").expect("file written");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "start"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git found")
}

fn canonical(path: &Path) -> String {
    path.canonicalize()
        .expect("path exists")
        .to_string_lossy()
        .into_owned()
}

#[test]
fn a_dropped_subfolder_resolves_to_the_repository_root() {
    let dir = repo();
    let root = git()
        .toplevel(&dir.path().join("src/deep"))
        .expect("the root is found");
    assert_eq!(
        root.map(|p| canonical(&p)),
        Some(canonical(dir.path())),
        "whatever inside the repository is dropped, the repository itself is what must be opened"
    );
}

#[test]
fn a_dropped_file_resolves_to_its_repository_root_too() {
    let dir = repo();
    let root = git()
        .toplevel(&dir.path().join("src/deep/a.txt"))
        .expect("the root is found");
    assert_eq!(root.map(|p| canonical(&p)), Some(canonical(dir.path())));
}

#[test]
fn a_folder_outside_any_repository_resolves_to_nothing() {
    let dir = TempDir::new().expect("temp directory");
    let root = git()
        .toplevel(dir.path())
        .expect("having no root is not an error");
    assert_eq!(
        root, None,
        "not a repository: say so honestly instead of opening something"
    );
}
