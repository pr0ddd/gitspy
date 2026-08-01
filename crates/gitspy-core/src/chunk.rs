use crate::layout::Layout;
use crate::state::{LayoutState, Snapshot};
use crate::topology::{CommitIdx, Topology};

/// Раскладывает всю топологию за один проход.
pub fn layout(topo: &Topology) -> Layout {
    let mut state = LayoutState::new();
    let mut out = Layout::default();
    for i in 0..topo.len() as CommitIdx {
        let (row, segments) = state.step(topo, i);
        out.rows.push(row);
        out.segments.push(segments);
    }
    out.max_lane = state.max_lane();
    out
}

/// Раскладывает топологию полосами, сохраняя снапшот на границе каждой.
///
/// Результат обязан совпадать с `layout` при любом `chunk_size`.
pub fn layout_chunked(topo: &Topology, chunk_size: usize) -> (Layout, Vec<Snapshot>) {
    assert!(chunk_size > 0, "размер полосы должен быть положительным");

    let mut out = Layout::default();
    let mut snapshots = Vec::new();
    let mut state = LayoutState::new();
    let total = topo.len();

    let mut start = 0usize;
    while start < total {
        let end = (start + chunk_size).min(total);
        // Явно проходим через снапшот, чтобы полоса считалась ровно так,
        // как она считалась бы при досчёте с диска.
        state = LayoutState::resume(state.snapshot());
        for i in start..end {
            let (row, segments) = state.step(topo, i as CommitIdx);
            out.rows.push(row);
            out.segments.push(segments);
        }
        snapshots.push(state.snapshot());
        start = end;
    }

    out.max_lane = state.max_lane();
    (out, snapshots)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixture;

    const SRC: &str = "m4: m3\nm3: m2, b1\nb1: m2\nm2: m1, a1\na1: m1\nm1\n";

    #[test]
    fn layout_produces_a_row_per_commit() {
        let parsed = fixture::parse(SRC).unwrap();
        let l = layout(&parsed.topology);
        assert_eq!(l.len(), 6);
        assert_eq!(l.segments.len(), 6);
        assert_eq!(l.rows.iter().map(|r| r.commit).collect::<Vec<_>>(), vec![0, 1, 2, 3, 4, 5]);
    }

    #[test]
    fn layout_of_empty_topology_is_empty() {
        let topo = crate::Topology::new(vec![], vec![]).unwrap();
        assert!(layout(&topo).is_empty());
    }

    #[test]
    fn layout_records_max_lane() {
        let parsed = fixture::parse(SRC).unwrap();
        assert_eq!(layout(&parsed.topology).max_lane, 1);
    }

    #[test]
    fn chunked_returns_a_snapshot_per_boundary() {
        let parsed = fixture::parse(SRC).unwrap();
        let (_, snaps) = layout_chunked(&parsed.topology, 2);
        assert_eq!(snaps.len(), 3);
    }

    #[test]
    fn resuming_from_a_snapshot_matches_the_whole_run() {
        let parsed = fixture::parse(SRC).unwrap();
        let whole = layout(&parsed.topology);
        for chunk_size in [1usize, 2, 3, 5, 6, 100] {
            let (chunked, _) = layout_chunked(&parsed.topology, chunk_size);
            assert_eq!(chunked, whole, "разошлось при chunk_size = {chunk_size}");
        }
    }

    #[test]
    fn snapshot_round_trips() {
        let parsed = fixture::parse(SRC).unwrap();
        let mut state = crate::state::LayoutState::new();
        state.step(&parsed.topology, 0);
        state.step(&parsed.topology, 1);
        let restored = crate::state::LayoutState::resume(state.snapshot());
        assert_eq!(restored, state);
    }
}
