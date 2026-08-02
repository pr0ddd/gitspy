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
        .expect("git запускается");
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
        std::fs::create_dir_all(parent).expect("каталог");
    }
    std::fs::write(full, text).expect("файл пишется");
}

fn repo() -> TempDir {
    let dir = TempDir::new().expect("временный каталог");
    run(dir.path(), &["init", "-b", "main"]);
    dir
}

fn commit(dir: &Path, message: &str) -> String {
    run(dir, &["add", "-A"]);
    run(dir, &["commit", "-m", message]);
    run(dir, &["rev-parse", "HEAD"])
}

fn git() -> Git {
    Git::discover().expect("git найден")
}

#[test]
fn an_added_file_is_reported_as_added_with_its_line_count() {
    let dir = repo();
    write(dir.path(), "a.txt", "одна\nдве\nтри\n");
    let hash = commit(dir.path(), "первый");

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("файлы читаются");
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].status, Status::Added);
    assert_eq!(files[0].path, "a.txt");
    assert_eq!(files[0].added, Some(3));
    assert_eq!(files[0].deleted, Some(0));
}

#[test]
fn a_rename_keeps_both_paths_and_is_not_two_separate_changes() {
    let dir = repo();
    write(dir.path(), "old.txt", "строка\n".repeat(20).as_str());
    commit(dir.path(), "первый");

    run(dir.path(), &["mv", "old.txt", "new.txt"]);
    let hash = commit(dir.path(), "переименование");

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("файлы читаются");
    assert_eq!(
        files.len(),
        1,
        "переименование — одно изменение, а не удаление плюс добавление"
    );
    assert_eq!(files[0].status, Status::Renamed);
    assert_eq!(files[0].old_path.as_deref(), Some("old.txt"));
    assert_eq!(files[0].path, "new.txt");
}

#[test]
fn a_binary_file_has_no_line_counts() {
    let dir = repo();
    std::fs::write(dir.path().join("logo.bin"), [0u8, 159, 146, 150, 0, 1, 2])
        .expect("двоичный файл");
    let hash = commit(dir.path(), "двоичный");

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("файлы читаются");
    assert_eq!(files[0].path, "logo.bin");
    assert!(files[0].is_binary(), "у двоичного файла строк не считают");
}

#[test]
fn a_path_with_spaces_and_cyrillics_survives() {
    let dir = repo();
    write(dir.path(), "папка с пробелами/файл.txt", "текст\n");
    let hash = commit(dir.path(), "путь с пробелами");

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("файлы читаются");
    assert_eq!(files[0].path, "папка с пробелами/файл.txt");
}

#[test]
fn a_merge_is_compared_against_its_first_parent() {
    let dir = repo();
    write(dir.path(), "base.txt", "основа\n");
    commit(dir.path(), "основа");

    run(dir.path(), &["checkout", "-b", "side"]);
    write(dir.path(), "side.txt", "боковой\n");
    commit(dir.path(), "боковой");

    run(dir.path(), &["checkout", "main"]);
    write(dir.path(), "main.txt", "основной\n");
    commit(dir.path(), "основной");

    run(dir.path(), &["merge", "--no-ff", "--no-edit", "side"]);
    let hash = run(dir.path(), &["rev-parse", "HEAD"]);

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("мерж читается");
    let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(
        paths,
        vec!["side.txt"],
        "мерж показывает то, что принёс, а не всю ветку"
    );
}

#[test]
fn the_first_commit_shows_everything_it_introduced() {
    let dir = repo();
    write(dir.path(), "a.txt", "а\n");
    write(dir.path(), "b.txt", "б\n");
    let hash = commit(dir.path(), "начало");

    let files = git()
        .commit_files(dir.path(), &hash)
        .expect("корневой коммит читается");
    let mut paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
    paths.sort();
    assert_eq!(paths, vec!["a.txt", "b.txt"]);
}

#[test]
fn file_contents_come_back_for_both_sides_of_a_change() {
    let dir = repo();
    write(dir.path(), "a.txt", "было\n");
    let before = commit(dir.path(), "было");
    write(dir.path(), "a.txt", "стало\n");
    let after = commit(dir.path(), "стало");

    let git = git();
    assert_eq!(
        git.file_at(dir.path(), &before, "a.txt").expect("старое"),
        "было"
    );
    assert_eq!(
        git.file_at(dir.path(), &after, "a.txt").expect("новое"),
        "стало"
    );
}

#[test]
fn a_file_that_did_not_exist_yet_reads_as_empty_rather_than_failing() {
    let dir = repo();
    write(dir.path(), "a.txt", "а\n");
    let first = commit(dir.path(), "первый");
    write(dir.path(), "b.txt", "б\n");
    commit(dir.path(), "второй");

    let text = git()
        .file_at(dir.path(), &first, "b.txt")
        .expect("не ошибка, а пустота");
    assert_eq!(text, "", "у добавленного файла нет старой стороны");
}
