use crate::colour::ColourIdx;
use crate::topology::CommitIdx;

pub type LaneIdx = u16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeKind {
    Normal,

    Merge,

    Root,

    Open,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Row {
    pub commit: CommitIdx,
    pub lane: LaneIdx,
    pub colour: ColourIdx,
    pub kind: NodeKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Segment {
    Through {
        lane: LaneIdx,
        colour: ColourIdx,
    },

    Branch {
        from: LaneIdx,
        to: LaneIdx,
        colour: ColourIdx,
    },

    Merge {
        from: LaneIdx,
        to: LaneIdx,
        colour: ColourIdx,
    },
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Layout {
    pub rows: Vec<Row>,

    pub segments: Vec<Vec<Segment>>,
    pub max_lane: LaneIdx,
}

impl Layout {
    pub fn len(&self) -> usize {
        self.rows.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_layout_reports_empty() {
        let layout = Layout::default();
        assert!(layout.is_empty());
        assert_eq!(layout.len(), 0);
        assert_eq!(layout.max_lane, 0);
    }

    #[test]
    fn len_counts_rows() {
        let layout = Layout {
            rows: vec![Row {
                commit: 0,
                lane: 0,
                colour: 0,
                kind: NodeKind::Root,
            }],
            segments: vec![vec![]],
            max_lane: 0,
        };
        assert_eq!(layout.len(), 1);
        assert!(!layout.is_empty());
    }

    #[test]
    fn segments_compare_by_value() {
        let a = Segment::Branch {
            from: 0,
            to: 1,
            colour: 2,
        };
        let b = Segment::Branch {
            from: 0,
            to: 1,
            colour: 2,
        };
        let c = Segment::Merge {
            from: 0,
            to: 1,
            colour: 2,
        };
        assert_eq!(a, b);
        assert_ne!(a, c);
    }
}
