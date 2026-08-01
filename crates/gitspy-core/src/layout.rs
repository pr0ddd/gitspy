use crate::colour::ColourIdx;
use crate::topology::CommitIdx;

/// Номер дорожки. Ноль — крайняя левая.
pub type LaneIdx = u16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeKind {
    /// Один известный родитель.
    Normal,
    /// Больше одного родителя.
    Merge,
    /// Родителей нет вовсе.
    Root,
    /// Все родители за границей загруженного набора; линия уходит вниз за край окна.
    Open,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Row {
    pub commit: CommitIdx,
    pub lane: LaneIdx,
    pub colour: ColourIdx,
    pub kind: NodeKind,
}

/// Что нарисовано в горизонтальной полосе одной строки, помимо самого узла.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Segment {
    /// Вертикаль, проходящая строку насквозь.
    Through { lane: LaneIdx, colour: ColourIdx },
    /// Из узла этой строки линия уходит вбок и дальше вниз.
    Branch { from: LaneIdx, to: LaneIdx, colour: ColourIdx },
    /// Линия из другой дорожки входит вбок в узел этой строки.
    Merge { from: LaneIdx, to: LaneIdx, colour: ColourIdx },
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Layout {
    pub rows: Vec<Row>,
    /// `segments[i]` — сегменты, пересекающие строку `i`.
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
            rows: vec![Row { commit: 0, lane: 0, colour: 0, kind: NodeKind::Root }],
            segments: vec![vec![]],
            max_lane: 0,
        };
        assert_eq!(layout.len(), 1);
        assert!(!layout.is_empty());
    }

    #[test]
    fn segments_compare_by_value() {
        let a = Segment::Branch { from: 0, to: 1, colour: 2 };
        let b = Segment::Branch { from: 0, to: 1, colour: 2 };
        let c = Segment::Merge { from: 0, to: 1, colour: 2 };
        assert_eq!(a, b);
        assert_ne!(a, c);
    }
}
