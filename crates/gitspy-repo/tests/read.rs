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
    .expect("repository reads");
    h.nodes
        .iter()
        .filter_map(gitspy_repo::Node::commit)
        .map(|c| c.hash.clone())
        .collect()
}

#[test]
fn commit_meta_carries_both_identities_verbatim_from_git() {
    let f = Fixture::new();
    f.commit("our own work");
    f.commit_committed_by("merged through the web UI", "GitHub", "noreply@github.com");

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("repository reads");
    let ours: Vec<String> = history
        .nodes
        .iter()
        .filter_map(gitspy_repo::Node::commit)
        .map(|c| {
            format!(
                "{} {} {} {} {} {} {}",
                c.hash, c.author, c.email, c.time, c.committer, c.committer_email, c.committer_time
            )
        })
        .collect();
    let gits: Vec<String> = f
        .run(&[
            "log",
            "--all",
            "--date-order",
            "--format=%H %an %ae %at %cn %ce %ct",
        ])
        .lines()
        .map(str::to_string)
        .collect();

    assert_eq!(ours, gits, "both commit identities match git log");
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
    f.commit_at("parent dated in the future", 1_900_000_000);
    f.run(&["branch", "points-at-parent"]);
    f.commit_at("child dated earlier", 1_600_000_000);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("repository reads");

    for i in 0..history.topology.len() as CommitIdx {
        for &p in history.topology.parents(i) {
            assert!(p > i, "parent {p} comes before child {i}");
        }
        assert_eq!(
            history.topology.outside_parents(i),
            0,
            "there must be no outside parents: the whole history is loaded"
        );
    }
    assert_eq!(our_order(&f), f.git_date_order());
}

#[test]
fn parent_never_precedes_child_even_with_clock_skew() {
    let f = Fixture::new();
    f.commit_at("old ancestor", 1_600_000_000);
    f.commit_at("parent dated in the future", 1_900_000_000);
    f.commit_at("child dated earlier", 1_600_000_100);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("repository reads");

    for i in 0..history.topology.len() as CommitIdx {
        for &p in history.topology.parents(i) {
            assert!(p > i, "parent {p} comes before child {i}");
        }
        assert_eq!(
            history.topology.outside_parents(i),
            0,
            "there must be no outside parents: the whole history is loaded"
        );
    }
    assert_eq!(our_order(&f), f.git_date_order());
}

#[test]
fn seeds_come_back_with_the_row_they_landed_on() {
    let f = Fixture::new();
    f.commit("a");
    f.run(&["tag", "light"]);
    f.run(&["tag", "-a", "annotated", "-m", "an annotated tag"]);
    f.run(&["branch", "feature"]);
    f.commit("b");

    let seeds = seeds_at(f.path());
    let history = gitspy_repo::read(f.path(), None, &seeds, head_at(f.path()).as_deref())
        .expect("repository reads");

    assert!(
        !seeds.is_empty(),
        "the fixture must produce at least one seed"
    );
    for seed in &seeds {
        let row = history
            .rows
            .get(&seed.oid)
            .unwrap_or_else(|| panic!("seed {} got no row but its commit is reachable", seed.oid));
        assert_eq!(
            history.nodes[*row as usize]
                .commit()
                .expect("the row of a seed is a commit")
                .hash,
            seed.oid,
            "the row number must point at the same object"
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
        .expect("repository reads even with an unreachable seed");

    assert!(
        !history.rows.contains_key(&missing.oid),
        "otherwise the ref would be drawn pointing at somebody else's row"
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
    .expect("repository reads");

    assert!(
        history.head.is_some(),
        "off a branch HEAD still points at a commit, and the graph has to know which one"
    );
}

#[test]
fn stash_hangs_off_the_commit_it_was_made_on() {
    let f = Fixture::new();
    let base = f.commit_file("a.txt", "first version", "start");
    f.write_file("a.txt", "a change");
    let stash = f.stash("stashed work", false);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("repository reads");
    assert_eq!(
        history.nodes.len(),
        2,
        "only the first commit and the stash are visible"
    );

    let idx = history
        .nodes
        .iter()
        .position(|n| n.commit().map(|c| c.hash.as_str()) == Some(stash.as_str()))
        .expect("the stash entry is found") as CommitIdx;
    let parents = history.topology.parents(idx);
    assert_eq!(
        parents.len(),
        1,
        "the stash entry has exactly one visible parent"
    );
    assert_eq!(
        history.nodes[parents[0] as usize]
            .commit()
            .expect("commit")
            .hash,
        base,
        "and it is the commit the stash was made on"
    );
    assert_eq!(
        history.topology.outside_parents(idx),
        0,
        "the index snapshot is hidden on purpose, this is not a break in the history"
    );
}

#[test]
fn untracked_snapshot_of_a_stash_is_not_an_orphan_root() {
    let f = Fixture::new();
    f.commit_file("a.txt", "first version", "start");
    f.write_file("a.txt", "a change");
    f.write_file("new.txt", "untracked");
    f.stash("stash with an untracked snapshot", true);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("repository reads");
    assert_eq!(
        history.nodes.len(),
        2,
        "only the first commit and the stash are visible"
    );

    let roots = (0..history.nodes.len() as CommitIdx)
        .filter(|&i| {
            history.topology.parents(i).is_empty() && history.topology.outside_parents(i) == 0
        })
        .count();
    assert_eq!(roots, 1, "the history has exactly one root");
}

#[test]
fn geometry_and_full_read_agree_on_everything_but_metadata() {
    let f = Fixture::new();
    f.commit_file("a.txt", "first", "start");
    f.run(&["tag", "-a", "v1", "-m", "release"]);
    f.run(&["checkout", "-b", "side"]);
    f.commit("side");
    f.run(&["checkout", "main"]);
    f.commit("main");
    f.merge("side", "merge");
    f.run(&["branch", "another"]);
    f.write_file("a.txt", "a change");
    f.stash("stashed work", true);

    let full = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("full read");
    let geometry = gitspy_repo::read_geometry(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("geometry read");

    assert_eq!(
        geometry.topology, full.topology,
        "geometry takes parents from the walk, the full read takes them from the \
         decoded commit; two sources of the same data must not diverge quietly"
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
        .expect("full read");
    let geometry =
        gitspy_repo::read_geometry(&path, None, &seeds_at(&path), head_at(&path).as_deref())
            .expect("geometry read");

    assert_eq!(
        geometry.topology, full.topology,
        "the bottom commit has a parent in its header but no object for it: the one \
         place where the two sources of parents could diverge"
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
    .expect("full read");
    let geometry = gitspy_repo::read_geometry(
        f.path(),
        Some(3),
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("geometry read");

    assert!(geometry.truncated, "truncation is reported");
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
    .expect("empty repository reads");
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
            "duplicate parent",
        ])
        .expect("commit-tree succeeds");
    f.run(&["update-ref", "refs/heads/weird", &weird]);

    let history = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("repository reads");
    let idx = history
        .nodes
        .iter()
        .position(|n| n.commit().map(|c| c.hash.as_str()) == Some(weird.as_str()))
        .expect("commit found") as CommitIdx;
    assert_eq!(
        history.topology.outside_parents(idx),
        0,
        "a duplicate parent is not an outside parent, it is simply skipped"
    );
    assert_eq!(history.topology.parents(idx).len(), 1, "one parent is left");
}

#[test]
fn bare_repository_reads_like_a_normal_one() {
    let f = Fixture::new();
    f.commit("a");
    f.commit("b");
    f.run(&["branch", "feature"]);

    let (_dir, path) = f.clone(&["--bare"]);
    let history = gitspy_repo::read(&path, None, &seeds_at(&path), head_at(&path).as_deref())
        .expect("bare repository reads");

    assert_eq!(history.nodes.len(), 2);
    assert!(
        history.rows.contains_key(&f.run(&["rev-parse", "feature"])),
        "branches are there"
    );
    assert!(history.head.is_some(), "a bare repository has a HEAD too");
}

#[test]
fn shallow_clone_does_not_reach_past_its_cut() {
    let f = Fixture::new();
    for i in 0..5 {
        f.commit(&format!("c{i}"));
    }

    let (_dir, path) = f.clone(&["--depth", "2"]);
    let history = gitspy_repo::read(&path, None, &seeds_at(&path), head_at(&path).as_deref())
        .expect("shallow clone reads");

    assert_eq!(
        history.nodes.len(),
        2,
        "the clone holds exactly two commits"
    );
    let cut = history.nodes.len() as CommitIdx - 1;
    assert_eq!(
        history.topology.outside_parents(cut),
        1,
        "the bottom commit has a parent beyond the edge of the clone"
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
    .expect("repository reads");
    assert_eq!(history.nodes.len(), 3);
    assert!(history.truncated, "truncation must be reported");
}

#[test]
fn worktrees_list_the_main_checkout_and_every_linked_one() {
    let f = Fixture::new();
    f.commit("a");
    f.run(&["branch", "side-branch"]);
    let linked = f.path().join("linked");
    f.run(&[
        "worktree",
        "add",
        linked.to_str().expect("path"),
        "side-branch",
    ]);

    let found = gitspy_repo::worktrees(f.path()).expect("worktrees read");
    let names: Vec<&str> = found.iter().map(|w| w.name.as_str()).collect();

    assert_eq!(
        found.len(),
        2,
        "the main checkout and one linked worktree: {names:?}"
    );
    assert!(found[0].is_main, "the main worktree comes first");
    assert_eq!(found[0].branch.as_deref(), Some("main"));
    assert_eq!(found[1].name, "linked");
    assert_eq!(found[1].branch.as_deref(), Some("side-branch"));
}

#[test]
fn bare_repository_has_no_main_worktree() {
    let f = Fixture::new();
    f.commit("a");
    let (_dir, path) = f.clone(&["--bare"]);

    let found = gitspy_repo::worktrees(&path).expect("worktrees read");
    assert!(found.is_empty(), "a bare repository has no working tree");
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
    .expect("read without a working tree");
    let head_index = plain
        .nodes
        .iter()
        .position(|n| n.commit().map(|c| c.hash.as_str()) == Some(head.as_str()))
        .expect("HEAD found") as CommitIdx;

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
    .expect("read with a working tree");

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
        "row zero is the working tree"
    );
    assert_eq!(
        with_tree.topology.parents(0),
        &[head_index + 1],
        "the parent of the working tree is HEAD at its new place"
    );
}

#[test]
fn adding_a_working_tree_row_moves_refs_and_head_with_the_commits() {
    let f = Fixture::new();
    f.commit("a");
    let head = f.commit("b");
    f.run(&["branch", "side"]);

    let plain = gitspy_repo::read(
        f.path(),
        None,
        &seeds_at(f.path()),
        head_at(f.path()).as_deref(),
    )
    .expect("read without a working tree");
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
    .expect("read with a working tree");

    assert!(
        !plain.rows.is_empty(),
        "otherwise the loop below checks nothing"
    );
    for (oid, before) in &plain.rows {
        assert_eq!(
            plain.rows.len(),
            with_tree.rows.len(),
            "the working tree row must not lose any refs"
        );
        assert_eq!(
            with_tree.rows.get(oid).copied(),
            Some(before + 1),
            "ref {oid} must point at the same row"
        );
    }
    assert_eq!(with_tree.head, plain.head.map(|h| h + 1));
}

#[test]
fn a_working_tree_during_a_merge_has_both_parents() {
    let f = Fixture::new();
    f.commit("base");
    f.run(&["checkout", "-b", "side"]);
    let side = f.commit("side");
    f.run(&["checkout", "main"]);
    let main = f.commit("main");

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
    .expect("read with a working tree");

    assert_eq!(
        history.topology.parents(0).len(),
        2,
        "during a merge the working tree has two parents, not one"
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
    .expect("empty repository");

    assert!(
        history.nodes.is_empty(),
        "there are no commits and no walk tips, so the row has nothing to stand on"
    );
}
