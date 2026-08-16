#![forbid(unsafe_code)]

mod model;
mod read;
mod worktrees;

pub use model::{CommitMeta, Error, History, Node, RefSeed, WorkingTreeTip};
pub use read::{read, read_geometry, read_with_working_tree, Geometry};
pub use worktrees::{worktrees, WorktreeInfo};

#[cfg(test)]
mod node_tests {
    use super::*;
    use gitspy_core::topology::Topology;

    fn commit(subject: &str, author: &str, hash: &str) -> Node {
        Node::Commit(CommitMeta {
            hash: hash.to_string(),
            author: author.to_string(),
            email: "p@example.com".to_string(),
            time: 0,
            committer: author.to_string(),
            committer_email: "p@example.com".to_string(),
            committer_time: 0,
            subject: subject.to_string(),
            body: String::new(),
        })
    }

    fn tip(added: u32, modified: u32) -> WorkingTreeTip {
        WorkingTreeTip {
            parents: Vec::new(),
            added,
            modified,
            deleted: 0,
            conflicts: 0,
            in_progress: None,
        }
    }

    fn history(nodes: Vec<Node>) -> History {
        History {
            topology: Topology::new(vec![Vec::new(); nodes.len()], vec![0; nodes.len()])
                .expect("lengths match"),
            nodes,
            rows: std::collections::HashMap::new(),
            head: None,
            truncated: false,
        }
    }

    #[test]
    fn a_search_looks_at_the_subject_the_author_and_the_hash() {
        let node = commit("Kahn re-sort for the café fixture", "pr0d", "5faa5f3abc");
        assert!(
            node.matches("CAFÉ"),
            "search is case-insensitive, and lowercasing folds non-ASCII letters too"
        );
        assert!(node.matches("pr0d"));
        assert!(node.matches("5faa5f"));
        assert!(!node.matches("rebase"));
    }

    #[test]
    fn a_hash_matches_from_the_start_because_that_is_how_people_type_it() {
        let node = commit("subject", "pr0d", "5faa5f3abc");
        assert!(node.matches("5faa"));
        assert!(
            !node.matches("f3abc"),
            "otherwise every commit would be found by a random fragment of its hash"
        );
    }

    #[test]
    fn an_empty_query_finds_nothing_rather_than_everything() {
        assert!(!commit("subject", "pr0d", "abc").matches("   "));
    }

    #[test]
    fn the_working_tree_row_is_not_a_search_result() {
        let node = Node::WorkingTree {
            added: 1,
            modified: 0,
            deleted: 0,
            conflicts: 0,
            in_progress: None,
        };
        assert!(!node.matches("1"));
    }

    #[test]
    fn edited_counters_update_the_node_in_place_without_a_new_shape() {
        let mut read = history(vec![
            Node::WorkingTree {
                added: 0,
                modified: 1,
                deleted: 0,
                conflicts: 0,
                in_progress: None,
            },
            commit("subject", "pr0d", "abc"),
        ]);

        let changed = read.refresh_tip(Some(tip(2, 5)));
        assert!(!changed, "the counters changed, not the shape of the graph");
        assert_eq!(
            read.nodes.first(),
            Some(&Node::WorkingTree {
                added: 2,
                modified: 5,
                deleted: 0,
                conflicts: 0,
                in_progress: None,
            })
        );
    }

    #[test]
    fn a_tree_going_clean_or_dirty_changes_the_shape() {
        let mut dirty = history(vec![
            Node::WorkingTree {
                added: 1,
                modified: 0,
                deleted: 0,
                conflicts: 0,
                in_progress: None,
            },
            commit("subject", "pr0d", "abc"),
        ]);
        assert!(
            dirty.refresh_tip(None),
            "the node is gone: there are fewer rows now, so the history has to be re-read"
        );

        let mut clean = history(vec![commit("subject", "pr0d", "abc")]);
        assert!(clean.refresh_tip(Some(tip(1, 0))), "the node appeared");
    }
}
