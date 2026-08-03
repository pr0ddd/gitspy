use gitspy_exec::refs::RefKind;
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

fn named<'a>(
    found: &'a [gitspy_exec::refs::RefLine],
    name: &str,
) -> &'a gitspy_exec::refs::RefLine {
    found
        .iter()
        .find(|r| r.name == name)
        .unwrap_or_else(|| panic!("ссылка {name} не найдена"))
}

#[test]
fn only_the_checked_out_branch_is_marked_head() {
    let dir = repo();
    run(dir.path(), &["branch", "other"]);

    let found = git().refs(dir.path()).expect("ссылки читаются");
    let marked: Vec<&str> = found
        .iter()
        .filter(|r| r.is_head)
        .map(|r| r.name.as_str())
        .collect();

    assert_eq!(
        marked,
        ["main"],
        "две ветки на одном коммите — галка обязана быть одна"
    );
}

#[test]
fn detached_head_marks_nothing() {
    let dir = repo();
    run(dir.path(), &["checkout", "--detach"]);

    let found = git().refs(dir.path()).expect("ссылки читаются");

    assert!(
        !found.iter().any(|r| r.is_head),
        "стоя вне ветки, нельзя быть ни на одной из них"
    );
}

#[test]
fn an_annotated_tag_resolves_to_its_commit() {
    let dir = repo();
    run(dir.path(), &["tag", "-a", "heavy", "-m", "подпись"]);

    let head = git().head_oid(dir.path()).expect("HEAD существует");
    let found = git().refs(dir.path()).expect("ссылки читаются");

    assert_eq!(
        named(&found, "heavy").oid,
        head,
        "тег обязан указывать на коммит, а не на объект тега"
    );
}

#[test]
fn a_tag_pointing_at_a_blob_does_not_break_the_read() {
    let dir = repo();
    write(dir.path(), "loose.txt", "просто содержимое\n");
    let blob = run(dir.path(), &["hash-object", "-w", "loose.txt"]);
    run(dir.path(), &["tag", "-a", "onblob", "-m", "подпись", &blob]);

    let found = git().refs(dir.path()).expect("ссылки читаются");

    assert!(
        !found.iter().any(|r| r.name == "onblob"),
        "git log --all такие ссылки молча пропускает, и мы обязаны так же"
    );
    assert!(
        found.iter().any(|r| r.name == "main"),
        "одна негодная ссылка не отменяет остальные"
    );
}

#[test]
fn every_stash_entry_is_visible_not_just_the_top() {
    let dir = repo();
    for text in ["второе\n", "третье\n"] {
        write(dir.path(), "base.txt", text);
        run(dir.path(), &["stash"]);
    }

    let found = git().refs(dir.path()).expect("ссылки читаются");
    let stashes: Vec<&str> = found
        .iter()
        .filter(|r| r.kind == RefKind::Stash)
        .map(|r| r.name.as_str())
        .collect();

    assert_eq!(
        stashes,
        ["stash@{0}", "stash@{1}"],
        "refs/stash указывает только на верхнюю запись, остальные лежат в её рефлоге"
    );
}

#[test]
fn a_repository_without_stashes_still_reads() {
    let dir = repo();

    let found = git().refs(dir.path()).expect("ссылки читаются");

    assert!(
        found.iter().all(|r| r.kind != RefKind::Stash),
        "пустой список стешей не должен превращаться в одну пустую запись"
    );
}

fn diverged() -> (TempDir, std::path::PathBuf) {
    let holder = TempDir::new().expect("временный каталог");
    let upstream = holder.path().join("upstream");
    let clone = holder.path().join("clone");

    std::fs::create_dir(&upstream).expect("каталог для источника");
    run(&upstream, &["init", "-b", "main"]);
    write(&upstream, "base.txt", "основа\n");
    run(&upstream, &["add", "-A"]);
    run(&upstream, &["commit", "-m", "начало"]);

    run(
        holder.path(),
        &["clone", upstream.to_str().expect("путь в utf-8"), "clone"],
    );

    write(&upstream, "base.txt", "работа на сервере\n");
    run(&upstream, &["commit", "-am", "чужая работа"]);

    write(&clone, "mine.txt", "моя работа\n");
    run(&clone, &["add", "-A"]);
    run(&clone, &["commit", "-m", "моя работа"]);
    run(&clone, &["fetch"]);

    (holder, clone)
}

#[test]
fn tracking_counts_match_what_git_itself_reports() {
    let (_holder, clone) = diverged();

    let found = git().refs(&clone).expect("ссылки читаются");
    let main = named(&found, "main");

    let counted = run(
        &clone,
        &["rev-list", "--left-right", "--count", "main...origin/main"],
    );
    let mut numbers = counted.split_whitespace();
    let ahead: u32 = numbers.next().expect("ahead есть").parse().expect("число");
    let behind: u32 = numbers.next().expect("behind есть").parse().expect("число");

    assert!(
        ahead > 0 && behind > 0,
        "фикстура обязана разойтись в обе стороны: на нулях этот тест зеленел бы и на разборе, который всегда возвращает нули"
    );
    assert_eq!(
        (main.ahead, main.behind),
        (ahead, behind),
        "стрелки обязаны совпадать с независимым ответом самого git"
    );
    assert_eq!(main.upstream.as_deref(), Some("origin/main"));
}

#[test]
fn an_upstream_that_disappeared_is_reported_as_gone_not_as_zeroes() {
    let (_holder, clone) = diverged();
    run(&clone, &["update-ref", "-d", "refs/remotes/origin/main"]);

    let found = git().refs(&clone).expect("ссылки читаются");

    assert!(
        named(&found, "main").gone,
        "нули значили бы «сверено и совпало», а сверять уже не с чем"
    );
}
