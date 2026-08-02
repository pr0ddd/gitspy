pub type CommitIdx = u32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TopologyError {
    LengthMismatch {
        parents: usize,
        outside: usize,
    },
    ParentOutOfRange {
        commit: CommitIdx,
        parent: CommitIdx,
        len: usize,
    },
    ParentNotAfterChild {
        commit: CommitIdx,
        parent: CommitIdx,
    },
    DuplicateParent {
        commit: CommitIdx,
        parent: CommitIdx,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Topology {
    parents: Vec<Vec<CommitIdx>>,
    outside_parents: Vec<u32>,
}

impl Topology {
    pub fn new(
        parents: Vec<Vec<CommitIdx>>,
        outside_parents: Vec<u32>,
    ) -> Result<Self, TopologyError> {
        if parents.len() != outside_parents.len() {
            return Err(TopologyError::LengthMismatch {
                parents: parents.len(),
                outside: outside_parents.len(),
            });
        }
        let len = parents.len();
        for (i, ps) in parents.iter().enumerate() {
            let commit = i as CommitIdx;
            for (j, &parent) in ps.iter().enumerate() {
                if parent as usize >= len {
                    return Err(TopologyError::ParentOutOfRange {
                        commit,
                        parent,
                        len,
                    });
                }
                if parent <= commit {
                    return Err(TopologyError::ParentNotAfterChild { commit, parent });
                }
                if ps[..j].contains(&parent) {
                    return Err(TopologyError::DuplicateParent { commit, parent });
                }
            }
        }
        Ok(Self {
            parents,
            outside_parents,
        })
    }

    pub fn len(&self) -> usize {
        self.parents.len()
    }

    pub fn is_empty(&self) -> bool {
        self.parents.is_empty()
    }

    pub fn parents(&self, i: CommitIdx) -> &[CommitIdx] {
        &self.parents[i as usize]
    }

    pub fn outside_parents(&self, i: CommitIdx) -> u32 {
        self.outside_parents[i as usize]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_linear_history() {
        let topo = Topology::new(vec![vec![1], vec![2], vec![]], vec![0, 0, 0]).unwrap();
        assert_eq!(topo.len(), 3);
        assert_eq!(topo.parents(0), &[1]);
        assert_eq!(topo.parents(2), &[] as &[CommitIdx]);
    }

    #[test]
    fn accepts_empty() {
        let topo = Topology::new(vec![], vec![]).unwrap();
        assert!(topo.is_empty());
    }

    #[test]
    fn records_outside_parents() {
        let topo = Topology::new(vec![vec![]], vec![1]).unwrap();
        assert_eq!(topo.outside_parents(0), 1);
    }

    #[test]
    fn rejects_parent_out_of_range() {
        let err = Topology::new(vec![vec![5]], vec![0]).unwrap_err();
        assert_eq!(
            err,
            TopologyError::ParentOutOfRange {
                commit: 0,
                parent: 5,
                len: 1
            }
        );
    }

    #[test]
    fn rejects_parent_before_child() {
        let err = Topology::new(vec![vec![1], vec![0]], vec![0, 0]).unwrap_err();
        assert_eq!(
            err,
            TopologyError::ParentNotAfterChild {
                commit: 1,
                parent: 0
            }
        );
    }

    #[test]
    fn rejects_self_parent() {
        let err = Topology::new(vec![vec![0]], vec![0]).unwrap_err();
        assert_eq!(
            err,
            TopologyError::ParentNotAfterChild {
                commit: 0,
                parent: 0
            }
        );
    }

    #[test]
    fn rejects_length_mismatch() {
        let err = Topology::new(vec![vec![]], vec![]).unwrap_err();
        assert_eq!(
            err,
            TopologyError::LengthMismatch {
                parents: 1,
                outside: 0
            }
        );
    }

    #[test]
    fn rejects_duplicate_parent() {
        let err = Topology::new(vec![vec![1, 1], vec![]], vec![0, 0]).unwrap_err();
        assert_eq!(
            err,
            TopologyError::DuplicateParent {
                commit: 0,
                parent: 1
            }
        );
    }
}
