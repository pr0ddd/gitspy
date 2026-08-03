mod support;

use gitspy_core::topology::CommitIdx;
use support::{head_at, seeds_at, Fixture};

fn our_order(f: &Fixture) -> Vec<String> {
    let h = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("репозиторий читается");
    h.nodes
        .iter()
        .filter_map(gitspy_repo::Node::commit)
        .map(|c| c.hash.clone())
        .collect()
}

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
fn parent_never_precedes_child_when_a_branch_points_at_the_parent() {
    let f = Fixture::new();
    f.commit_at("родитель из будущего", 1_900_000_000);
    f.run(&["branch", "points-at-parent"]);
    f.commit_at("потомок с ранней датой", 1_600_000_000);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("репозиторий читается");

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

#[test]
fn parent_never_precedes_child_even_with_clock_skew() {
    let f = Fixture::new();
    f.commit_at("старый предок", 1_600_000_000);
    f.commit_at("родитель из будущего", 1_900_000_000);
    f.commit_at("потомок с ранней датой", 1_600_000_100);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("репозиторий читается");

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

#[test]
fn seeds_come_back_with_the_row_they_landed_on() {
    let f = Fixture::new();
    f.commit("a");
    f.run(&["tag", "light"]);
    f.run(&["tag", "-a", "annotated", "-m", "аннотированный"]);
    f.run(&["branch", "feature"]);
    f.commit("b");

    let seeds = seeds_at(f.path());
    let history = gitspy_repo::read(f.path(), None, &seeds, head_at(f.path()).as_deref())
        .expect("репозиторий читается");

    assert!(!seeds.is_empty(), "фикстура обязана дать хоть одно семя");
    for seed in &seeds {
        let row = history
            .rows
            .get(&seed.oid)
            .unwrap_or_else(|| panic!("семя {} не нашло строки, хотя коммит достижим", seed.oid));
        assert_eq!(
            history.nodes[*row as usize]
                .commit()
                .expect("строка семени это коммит")
                .hash,
            seed.oid,
            "номер строки обязан указывать на тот же объект"
        );
    }
}

#[test]
fn a_seed_outside_the_walk_gets_no_row_rather_than_a_wrong_one() {
    let f = Fixture::new();
    f.commit("a");

    let missing = gitspy_repo::RefSeed {
        oid: "0123456789abcdef0123456789abcdef01234567".to_string(),
        is_stash: false,
    };
    let mut seeds = seeds_at(f.path());
    seeds.push(missing.clone());

    let history = gitspy_repo::read(f.path(), None, &seeds, head_at(f.path()).as_deref())
        .expect("репозиторий читается несмотря на недостижимое семя");

    assert!(
        !history.rows.contains_key(&missing.oid),
        "иначе ссылка нарисовалась бы указывающей в чужую строку"
    );
}

#[test]
fn detached_head_still_has_a_row_even_though_no_branch_is_current() {
    let f = Fixture::new();
    f.commit("a");
    f.commit("b");
    let sha = f.run(&["rev-parse", "HEAD"]);
    f.run(&["checkout", "--detach", &sha]);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("репозиторий читается");

    assert!(
        history.head.is_some(),
        "вне ветки HEAD всё равно указывает на коммит, и граф обязан знать какой"
    );
}

#[test]
fn stash_hangs_off_the_commit_it_was_made_on() {
    let f = Fixture::new();
    let base = f.commit_file("a.txt", "первая версия", "начало");
    f.write_file("a.txt", "изменение");
    let stash = f.stash("спрятанное", false);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("репозиторий читается");
    assert_eq!(
        history.nodes.len(),
        2,
        "видны только начальный коммит и стэш"
    );

    let idx = history
        .nodes
        .iter()
        .position(|n| n.commit().map(|c| c.hash.as_str()) == Some(stash.as_str()))
        .expect("запись стэша найдена") as CommitIdx;
    let parents = history.topology.parents(idx);
    assert_eq!(
        parents.len(),
        1,
        "у записи стэша ровно один видимый родитель"
    );
    assert_eq!(
        history.nodes[parents[0] as usize]
            .commit()
            .expect("коммит")
            .hash,
        base,
        "и это коммит, на котором стэшили"
    );
    assert_eq!(
        history.topology.outside_parents(idx),
        0,
        "снимок индекса скрыт сознательно, это не обрыв истории"
    );
}

#[test]
fn untracked_snapshot_of_a_stash_is_not_an_orphan_root() {
    let f = Fixture::new();
    f.commit_file("a.txt", "первая версия", "начало");
    f.write_file("a.txt", "изменение");
    f.write_file("новый.txt", "неотслеживаемый");
    f.stash("со снимком неотслеживаемых", true);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("репозиторий читается");
    assert_eq!(
        history.nodes.len(),
        2,
        "видны только начальный коммит и стэш"
    );

    let roots = (0..history.nodes.len() as CommitIdx)
        .filter(|&i| {
            history.topology.parents(i).is_empty() && history.topology.outside_parents(i) == 0
        })
        .count();
    assert_eq!(roots, 1, "корень в истории ровно один");
}

#[test]
fn geometry_and_full_read_agree_on_everything_but_metadata() {
    let f = Fixture::new();
    f.commit_file("a.txt", "первая", "начало");
    f.run(&["tag", "-a", "v1", "-m", "релиз"]);
    f.run(&["checkout", "-b", "side"]);
    f.commit("боковой");
    f.run(&["checkout", "main"]);
    f.commit("основной");
    f.merge("side", "слияние");
    f.run(&["branch", "ещё-одна"]);
    f.write_file("a.txt", "изменение");
    f.stash("спрятанное", true);

    let full = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("полное чтение");
    let geometry = gitspy_repo::read_geometry(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("чтение геометрии");

    assert_eq!(
        geometry.topology, full.topology,
        "родители у геометрии берутся из обхода, у полного чтения — из разобранного \
         коммита; это два источника одних данных, и разойтись они должны громко"
    );
    assert_eq!(geometry.rows, full.rows);
    assert_eq!(geometry.head, full.head);
    assert_eq!(geometry.truncated, full.truncated);
}

#[test]
fn geometry_and_full_read_agree_at_a_shallow_cut() {
    let f = Fixture::new();
    for i in 0..5 {
        f.commit(&format!("c{i}"));
    }
    let (_dir, path) = f.clone(&["--depth", "2"]);

    let full = gitspy_repo::read(&path, None, &seeds_at(&path), head_at(&path).as_deref())
        .expect("полное чтение");
    let geometry =
        gitspy_repo::read_geometry(&path, None, &seeds_at(&path), head_at(&path).as_deref())
            .expect("чтение геометрии");

    assert_eq!(
        geometry.topology, full.topology,
        "у нижнего коммита родитель записан в заголовке, но объекта нет — \
         единственное место, где два источника родителей могли бы разойтись"
    );
}

#[test]
fn geometry_and_full_read_agree_when_the_walk_is_truncated() {
    let f = Fixture::new();
    for i in 0..6 {
        f.commit(&format!("c{i}"));
    }

    let full = gitspy_repo::read(
        f.path(),
        Some(3),
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("полное чтение");
    let geometry = gitspy_repo::read_geometry(
        f.path(),
        Some(3),
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("чтение геометрии");

    assert!(geometry.truncated, "обрезание заявлено");
    assert_eq!(geometry.topology, full.topology);
}

#[test]
fn empty_repository_reads_as_empty() {
    let f = Fixture::new();
    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("пустой репозиторий читается");
    assert!(history.nodes.is_empty());
    assert!(history.rows.is_empty());
    assert!(history.head.is_none());
}

#[test]
fn duplicate_parent_is_not_counted_as_outside() {
    let f = Fixture::new();
    let base = f.commit("base");
    let tree = f.run(&["rev-parse", "HEAD^{tree}"]);
    let weird = f
        .try_run(&[
            "commit-tree",
            &tree,
            "-p",
            &base,
            "-p",
            &base,
            "-m",
            "дубль-родитель",
        ])
        .expect("commit-tree отрабатывает");
    f.run(&["update-ref", "refs/heads/weird", &weird]);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("репозиторий читается");
    let idx = history
        .nodes
        .iter()
        .position(|n| n.commit().map(|c| c.hash.as_str()) == Some(weird.as_str()))
        .expect("коммит найден") as CommitIdx;
    assert_eq!(
        history.topology.outside_parents(idx),
        0,
        "дубль-родитель не внешний, его надо просто пропустить"
    );
    assert_eq!(
        history.topology.parents(idx).len(),
        1,
        "остаётся один родитель"
    );
}

#[test]
fn bare_repository_reads_like_a_normal_one() {
    let f = Fixture::new();
    f.commit("a");
    f.commit("b");
    f.run(&["branch", "feature"]);

    let (_dir, path) = f.clone(&["--bare"]);
    let history = gitspy_repo::read(&path, None, &seeds_at(&path), head_at(&path).as_deref())
        .expect("голый репозиторий читается");

    assert_eq!(history.nodes.len(), 2);
    assert!(
        history.rows.contains_key(&f.run(&["rev-parse", "feature"])),
        "ветки на месте"
    );
    assert!(
        history.head.is_some(),
        "HEAD у голого репозитория тоже есть"
    );
}

#[test]
fn shallow_clone_does_not_reach_past_its_cut() {
    let f = Fixture::new();
    for i in 0..5 {
        f.commit(&format!("c{i}"));
    }

    let (_dir, path) = f.clone(&["--depth", "2"]);
    let history = gitspy_repo::read(&path, None, &seeds_at(&path), head_at(&path).as_deref())
        .expect("поверхностный клон читается");

    assert_eq!(history.nodes.len(), 2, "клон содержит ровно два коммита");
    let cut = history.nodes.len() as CommitIdx - 1;
    assert_eq!(
        history.topology.outside_parents(cut),
        1,
        "у нижнего коммита родитель за границей клона"
    );
}

#[test]
fn max_commits_truncates_and_reports_it() {
    let f = Fixture::new();
    for i in 0..5 {
        f.commit(&format!("c{i}"));
    }
    let history = gitspy_repo::read(
        f.path(),
        Some(3),
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("репозиторий читается");
    assert_eq!(history.nodes.len(), 3);
    assert!(history.truncated, "обрезание должно быть заявлено");
}

#[test]
fn worktrees_list_the_main_checkout_and_every_linked_one() {
    let f = Fixture::new();
    f.commit("a");
    f.run(&["branch", "побочная"]);
    let linked = f.path().join("linked");
    f.run(&[
        "worktree",
        "add",
        linked.to_str().expect("путь"),
        "побочная",
    ]);

    let found = gitspy_repo::worktrees(f.path()).expect("воркtree читаются");
    let names: Vec<&str> = found.iter().map(|w| w.name.as_str()).collect();

    assert_eq!(
        found.len(),
        2,
        "основная копия и одна привязанная: {names:?}"
    );
    assert!(found[0].is_main, "первой идёт основная");
    assert_eq!(found[0].branch.as_deref(), Some("main"));
    assert_eq!(found[1].name, "linked");
    assert_eq!(found[1].branch.as_deref(), Some("побочная"));
}

#[test]
fn bare_repository_has_no_main_worktree() {
    let f = Fixture::new();
    f.commit("a");
    let (_dir, path) = f.clone(&["--bare"]);

    let found = gitspy_repo::worktrees(&path).expect("воркtree читаются");
    assert!(found.is_empty(), "у голого репозитория рабочего дерева нет");
}

#[test]
fn a_working_tree_row_becomes_the_child_of_head_without_shifting_anything_by_hand() {
    let f = Fixture::new();
    f.commit("a");
    let head = f.commit("b");

    let plain = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("без рабочего дерева");
    let head_index = plain
        .nodes
        .iter()
        .position(|n| n.commit().map(|c| c.hash.as_str()) == Some(head.as_str()))
        .expect("HEAD найден") as CommitIdx;

    let tip = gitspy_repo::WorkingTreeTip {
        parents: vec![head.clone()],
        added: 1,
        modified: 2,
        deleted: 0,
        conflicts: 0,
        in_progress: None,
    };
    let with_tree = gitspy_repo::read_with_working_tree(
        f.path(),
        None,
        Some(tip),
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("с рабочим деревом");

    assert_eq!(with_tree.nodes.len(), plain.nodes.len() + 1);
    assert!(
        matches!(
            with_tree.nodes[0],
            gitspy_repo::Node::WorkingTree {
                added: 1,
                modified: 2,
                ..
            }
        ),
        "нулевая строка — рабочее дерево"
    );
    assert_eq!(
        with_tree.topology.parents(0),
        &[head_index + 1],
        "родитель рабочего дерева — HEAD на своём новом месте"
    );
}

#[test]
fn adding_a_working_tree_row_moves_refs_and_head_with_the_commits() {
    let f = Fixture::new();
    f.commit("a");
    let head = f.commit("b");
    f.run(&["branch", "боковая"]);

    let plain = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("без рабочего дерева");
    let tip = gitspy_repo::WorkingTreeTip {
        parents: vec![head.clone()],
        added: 0,
        modified: 1,
        deleted: 0,
        conflicts: 0,
        in_progress: None,
    };
    let with_tree = gitspy_repo::read_with_working_tree(
        f.path(),
        None,
        Some(tip),
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("с деревом");

    assert!(
        !plain.rows.is_empty(),
        "иначе цикл ниже ничего не проверяет"
    );
    for (oid, before) in &plain.rows {
        assert_eq!(
            plain.rows.len(),
            with_tree.rows.len(),
            "строка рабочего дерева не должна терять ссылки"
        );
        assert_eq!(
            with_tree.rows.get(oid).copied(),
            Some(before + 1),
            "ссылка {oid} обязана указывать на ту же строку"
        );
    }
    assert_eq!(with_tree.head, plain.head.map(|h| h + 1));
}

#[test]
fn a_working_tree_during_a_merge_has_both_parents() {
    let f = Fixture::new();
    f.commit("основа");
    f.run(&["checkout", "-b", "side"]);
    let side = f.commit("боковой");
    f.run(&["checkout", "main"]);
    let main = f.commit("основной");

    let tip = gitspy_repo::WorkingTreeTip {
        parents: vec![main.clone(), side.clone()],
        added: 0,
        modified: 1,
        deleted: 0,
        conflicts: 1,
        in_progress: Some("merge".into()),
    };
    let history = gitspy_repo::read_with_working_tree(
        f.path(),
        None,
        Some(tip),
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("с деревом");

    assert_eq!(
        history.topology.parents(0).len(),
        2,
        "во время мержа у рабочего дерева два родителя, а не один"
    );
}

#[test]
fn a_working_tree_in_a_repository_without_commits_is_a_root() {
    let f = Fixture::new();
    let tip = gitspy_repo::WorkingTreeTip {
        parents: vec![],
        added: 0,
        modified: 1,
        deleted: 0,
        conflicts: 0,
        in_progress: None,
    };
    let history = gitspy_repo::read_with_working_tree(
        f.path(),
        None,
        Some(tip),
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("пустой репозиторий");

    assert!(
        history.nodes.is_empty(),
        "коммитов нет и вершин обхода нет — строке не на чем стоять"
    );
}
