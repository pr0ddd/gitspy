//! Дифференциальные тесты слоя чтения против настоящего git.
//!
//! Принцип: не «мы думаем, что правильно», а «совпадает с эталоном». Всё, что
//! можно спросить у git, спрашивается у git.

mod support;

use gitspy_core::topology::CommitIdx;
use support::Fixture;

/// Хеши в порядке, в котором их выдал наш слой чтения.
fn our_order(f: &Fixture) -> Vec<String> {
    let h = gitspy_repo::read(f.path(), None).expect("репозиторий читается");
    h.commits.iter().map(|c| c.hash.clone()).collect()
}

/* ------------------------------- порядок ------------------------------- */

#[test]
fn order_matches_git_date_order() {
    let f = Fixture::new();
    f.commit("a");
    f.commit("b");
    f.run(&["checkout", "-b", "side"]);
    f.commit("c");
    f.run(&["checkout", "main"]);
    f.commit("d");
    f.merge("side", "merge side");

    assert_eq!(our_order(&f), f.git_date_order());
}

#[test]
fn parent_never_precedes_child_even_with_clock_skew() {
    // Родитель с БОЛЕЕ НОВОЙ датой, чем потомок: ровно тот случай, который
    // ломал обход по времени коммиттера и порождал фантомных «внешних»
    // родителей, а с ними — дорожки, которые никогда не закрываются.
    let f = Fixture::new();
    f.commit_at("старый предок", 1_600_000_000);
    f.commit_at("родитель из будущего", 1_900_000_000);
    f.commit_at("потомок с ранней датой", 1_600_000_100);

    let history = gitspy_repo::read(f.path(), None).expect("репозиторий читается");

    for i in 0..history.topology.len() as CommitIdx {
        for &p in history.topology.parents(i) {
            assert!(p > i, "родитель {p} стоит перед потомком {i}");
        }
        assert_eq!(
            history.topology.outside_parents(i),
            0,
            "внешних родителей быть не должно: история загружена целиком"
        );
    }
    assert_eq!(our_order(&f), f.git_date_order());
}

/* ------------------------------- ссылки ------------------------------- */

#[test]
fn refs_match_for_each_ref() {
    let f = Fixture::new();
    f.commit("a");
    f.run(&["tag", "light"]);
    f.run(&["tag", "-a", "annotated", "-m", "аннотированный"]);
    f.run(&["branch", "feature"]);

    let history = gitspy_repo::read(f.path(), None).expect("репозиторий читается");
    let ours: std::collections::BTreeSet<String> =
        history.refs.iter().map(|r| r.name.clone()).collect();

    for (full, _) in f.git_refs() {
        let short = full
            .strip_prefix("refs/heads/")
            .or_else(|| full.strip_prefix("refs/tags/"))
            .or_else(|| full.strip_prefix("refs/remotes/"));
        if let Some(short) = short {
            assert!(ours.contains(short), "ссылка {short} потеряна");
        }
    }
}

#[test]
fn annotated_tag_resolves_to_its_commit() {
    let f = Fixture::new();
    let sha = f.commit("a");
    f.run(&["tag", "-a", "v1", "-m", "релиз"]);

    let history = gitspy_repo::read(f.path(), None).expect("репозиторий читается");
    let tag = history.refs.iter().find(|r| r.name == "v1").expect("тег найден");
    assert_eq!(history.commits[tag.commit as usize].hash, sha);
}

/* ------------------------------ блокеры ------------------------------ */

#[test]
fn tag_pointing_at_blob_does_not_break_the_repository() {
    // peel_to_id разворачивает тег до первого не-тега — это может оказаться
    // blob. Такой oid уходил в вершины обхода и ронял чтение ВСЕГО
    // репозитория: ноль коммитов, пустой экран. git log --all такие ссылки
    // молча пропускает, и мы обязаны делать то же самое.
    let f = Fixture::new();
    f.commit("a");
    f.commit("b");
    let blob = f.write_blob("содержимое, на которое укажет тег");
    f.run(&["tag", "blobtag", &blob]);

    let history = gitspy_repo::read(f.path(), None).expect("репозиторий читается несмотря на тег");
    assert_eq!(history.commits.len(), 2, "оба коммита на месте");
    assert!(
        !history.refs.iter().any(|r| r.name == "blobtag"),
        "тег на blob в список ссылок не попадает"
    );
}

#[test]
fn tag_pointing_at_tree_does_not_break_the_repository() {
    let f = Fixture::new();
    f.commit("a");
    let tree = f.run(&["rev-parse", "HEAD^{tree}"]);
    f.run(&["tag", "treetag", &tree]);

    let history = gitspy_repo::read(f.path(), None).expect("репозиторий читается несмотря на тег");
    assert_eq!(history.commits.len(), 1);
    assert!(!history.refs.iter().any(|r| r.name == "treetag"));
}

/* ------------------------------- HEAD ------------------------------- */

#[test]
fn only_the_checked_out_branch_is_marked_head() {
    // is_head считался сравнением oid, поэтому две ветки на одном коммите
    // обе получали галочку «вы здесь».
    let f = Fixture::new();
    f.commit("a");
    f.run(&["branch", "dup"]);
    f.run(&["branch", "dup2"]);

    let history = gitspy_repo::read(f.path(), None).expect("репозиторий читается");
    let marked: Vec<&str> = history
        .refs
        .iter()
        .filter(|r| r.is_head)
        .map(|r| r.name.as_str())
        .collect();
    assert_eq!(marked, vec!["main"], "отмечена только текущая ветка");
}

#[test]
fn detached_head_marks_nothing() {
    let f = Fixture::new();
    f.commit("a");
    f.commit("b");
    let sha = f.run(&["rev-parse", "HEAD"]);
    f.run(&["checkout", "--detach", &sha]);

    let history = gitspy_repo::read(f.path(), None).expect("репозиторий читается");
    assert!(
        !history.refs.iter().any(|r| r.is_head),
        "при detached HEAD текущей ветки нет, отмечать нечего"
    );
    assert!(history.head.is_some(), "но сам HEAD известен");
}

/* --------------------------- краевые случаи --------------------------- */

#[test]
fn empty_repository_reads_as_empty() {
    let f = Fixture::new();
    let history = gitspy_repo::read(f.path(), None).expect("пустой репозиторий читается");
    assert!(history.commits.is_empty());
    assert!(history.refs.is_empty());
    assert!(history.head.is_none());
}

#[test]
fn duplicate_parent_is_not_counted_as_outside() {
    // Коммит с одним и тем же родителем дважды — git такое допускает.
    // Дубль уходил в счётчик внешних родителей и рисовался обрывом в никуда.
    let f = Fixture::new();
    let base = f.commit("base");
    let tree = f.run(&["rev-parse", "HEAD^{tree}"]);
    let weird = f
        .try_run(&["commit-tree", &tree, "-p", &base, "-p", &base, "-m", "дубль-родитель"])
        .expect("commit-tree отрабатывает");
    f.run(&["update-ref", "refs/heads/weird", &weird]);

    let history = gitspy_repo::read(f.path(), None).expect("репозиторий читается");
    let idx = history
        .commits
        .iter()
        .position(|c| c.hash == weird)
        .expect("коммит найден") as CommitIdx;
    assert_eq!(
        history.topology.outside_parents(idx),
        0,
        "дубль-родитель не внешний, его надо просто пропустить"
    );
    assert_eq!(history.topology.parents(idx).len(), 1, "остаётся один родитель");
}

#[test]
fn max_commits_truncates_and_reports_it() {
    let f = Fixture::new();
    for i in 0..5 {
        f.commit(&format!("c{i}"));
    }
    let history = gitspy_repo::read(f.path(), Some(3)).expect("репозиторий читается");
    assert_eq!(history.commits.len(), 3);
    assert!(history.truncated, "обрезание должно быть заявлено");
}
