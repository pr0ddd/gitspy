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
    std::fs::write(dir.join(path), text).expect("файл");
}

fn conflicted_repo() -> TempDir {
    let dir = TempDir::new().expect("временный каталог");
    run(dir.path(), &["init", "-b", "main"]);
    write(dir.path(), "story.txt", "начало\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "base"]);
    run(dir.path(), &["checkout", "-b", "feature"]);
    write(dir.path(), "story.txt", "их вариант\n");
    run(dir.path(), &["commit", "-am", "theirs"]);
    run(dir.path(), &["checkout", "main"]);
    write(dir.path(), "story.txt", "наш вариант\n");
    run(dir.path(), &["commit", "-am", "ours"]);
    run(dir.path(), &["merge", "feature"]);
    dir
}

fn git() -> Git {
    Git::discover().expect("git найден")
}

#[test]
fn conflict_sides_match_the_index_stages_git_itself_reports() {
    let dir = conflicted_repo();
    let sides = git()
        .conflict_sides(dir.path(), "story.txt")
        .expect("стороны конфликта читаются");
    assert_eq!(
        sides.base,
        run(dir.path(), &["show", ":1:story.txt"]) + "\n",
        "база — стадия 1 индекса, общий предок"
    );
    assert_eq!(sides.ours, "наш вариант\n", "наша сторона — стадия 2");
    assert_eq!(sides.theirs, "их вариант\n", "их сторона — стадия 3");
}

#[test]
fn the_merge_heading_names_the_incoming_branch_and_keeps_gits_own_subject() {
    let dir = conflicted_repo();
    let heading = git()
        .merge_heading(dir.path())
        .expect("во время слияния MERGE_MSG существует");
    assert_eq!(
        heading.from.as_deref(),
        Some("feature"),
        "панели нужно имя вливаемой ветки, а оно есть только в MERGE_MSG"
    );
    assert_eq!(
        heading.subject, "Merge branch 'feature'",
        "заготовка сообщения — первая строка MERGE_MSG, как её напишет сам git"
    );
}

#[test]
fn a_calm_repository_has_no_merge_heading() {
    let dir = TempDir::new().expect("временный каталог");
    run(dir.path(), &["init", "-b", "main"]);
    assert!(git().merge_heading(dir.path()).is_none());
}

#[test]
fn resolving_a_file_writes_the_chosen_text_and_leaves_no_conflict_behind() {
    let dir = conflicted_repo();
    git()
        .resolve_file(dir.path(), "story.txt", "примирение\n")
        .expect("резолв записывается");

    let tree = git().status(dir.path()).expect("статус читается");
    assert_eq!(
        tree.change_counts().conflicts,
        0,
        "после резолва git обязан перестать считать файл конфликтным"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("story.txt")).expect("файл читается"),
        "примирение\n",
        "на диск ложится ровно то, что человек собрал в выводе"
    );
    assert_eq!(
        run(dir.path(), &["show", ":story.txt"]),
        "примирение",
        "резолв попадает в индекс, иначе merge --continue его не увидит"
    );
}

#[test]
fn the_merged_text_is_rebuilt_with_diff3_so_the_base_is_always_visible() {
    let dir = conflicted_repo();
    let merged = git()
        .conflict_merged(dir.path(), "story.txt")
        .expect("merged собирается из стадий индекса");
    assert!(
        merged.contains("|||||||"),
        "без базы выводу нечем показать нерешённый конфликт, как это делает GitKraken"
    );
    assert!(merged.contains("наш вариант"));
    assert!(merged.contains("их вариант"));
    assert!(merged.contains("начало"), "база — общий предок, стадия 1");
}
