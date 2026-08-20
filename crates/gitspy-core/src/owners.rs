use crate::topology::{CommitIdx, Topology};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Claim {
    owner: CommitIdx,
    hop: usize,
    child: CommitIdx,
}

impl Claim {
    fn beats(&self, other: &Claim) -> bool {
        (self.hop, self.child) < (other.hop, other.child)
    }
}

pub fn owners(topo: &Topology, labelled: &[bool]) -> Vec<Option<CommitIdx>> {
    let len = topo.len();
    let mut best: Vec<Option<Claim>> = vec![None; len];
    let mut result = vec![None; len];
    for commit in 0..len as CommitIdx {
        let owner = if labelled.get(commit as usize).copied().unwrap_or(false) {
            Some(commit)
        } else {
            best[commit as usize].map(|claim| claim.owner)
        };
        result[commit as usize] = owner;
        let Some(owner) = owner else {
            continue;
        };
        for (hop, &parent) in topo.parents(commit).iter().enumerate() {
            let claim = Claim {
                owner,
                hop,
                child: commit,
            };
            let slot = &mut best[parent as usize];
            if slot.is_none_or(|current| claim.beats(&current)) {
                *slot = Some(claim);
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn topo(parents: Vec<Vec<CommitIdx>>) -> Topology {
        let outside = vec![0; parents.len()];
        Topology::new(parents, outside).expect("a valid synthetic topology")
    }

    #[test]
    fn a_commit_belongs_to_the_nearest_label_above_it() {
        let topo = topo(vec![vec![1], vec![2], vec![3], vec![4], vec![]]);
        let labelled = [true, false, false, true, false];
        assert_eq!(
            owners(&topo, &labelled),
            vec![Some(0), Some(0), Some(0), Some(3), Some(3)],
            "rows under a label are that label's until the next label takes over"
        );
    }

    #[test]
    fn a_labelled_commit_owns_itself_even_under_another_label() {
        let topo = topo(vec![vec![1], vec![]]);
        assert_eq!(owners(&topo, &[true, true]), vec![Some(0), Some(1)]);
    }

    #[test]
    fn commits_above_every_label_belong_to_nobody() {
        let topo = topo(vec![vec![1], vec![2], vec![]]);
        assert_eq!(
            owners(&topo, &[false, true, false]),
            vec![None, Some(1), Some(1)],
            "nothing above a row can be reached from a label, so it is dimmed under any hover"
        );
    }

    #[test]
    fn a_shared_ancestor_goes_to_the_earliest_child_when_both_reach_it_as_a_first_parent() {
        let topo = topo(vec![vec![1, 2], vec![3], vec![3], vec![]]);
        let labelled = [true, false, true, false];
        assert_eq!(
            owners(&topo, &labelled),
            vec![Some(0), Some(0), Some(2), Some(0)],
            "row 1 (owned by 0) sits above row 2 (its own label), so their common parent follows row 1"
        );
    }

    #[test]
    fn a_first_parent_claim_beats_a_second_parent_claim_from_a_higher_row() {
        let topo = topo(vec![vec![1, 2], vec![3, 4], vec![4], vec![], vec![]]);
        let labelled = [true, false, true, false, false];
        assert_eq!(
            owners(&topo, &labelled),
            vec![Some(0), Some(0), Some(2), Some(0), Some(2)],
            "row 4 is the second parent of row 1 but the first parent of row 2, and first parents win"
        );
    }

    #[test]
    fn a_merge_passes_its_owner_to_both_parents_but_the_side_branch_keeps_its_own_label() {
        let topo = topo(vec![vec![1, 2], vec![3], vec![3], vec![]]);
        let labelled = [true, false, false, false];
        assert_eq!(
            owners(&topo, &labelled),
            vec![Some(0), Some(0), Some(0), Some(0)],
            "without a label of its own, a merged branch belongs to the branch that merged it"
        );
    }
}
