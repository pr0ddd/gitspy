use crate::layout::{LaneIdx, Layout};
use crate::state::{LayoutState, Snapshot};
use crate::topology::{CommitIdx, Topology};

pub const CHUNK: usize = 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skeleton {
    pub chunk: usize,
    pub snapshots: Vec<Snapshot>,
    pub lanes: Vec<LaneIdx>,
    pub max_lane: LaneIdx,
}

impl Skeleton {
    pub fn len(&self) -> usize {
        self.lanes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.lanes.is_empty()
    }
}

pub fn skeleton(topo: &Topology, chunk: usize) -> Skeleton {
    assert!(chunk > 0, "chunk size must be positive");

    let total = topo.len();
    let mut state = LayoutState::new();
    let mut snapshots = Vec::with_capacity(total.div_ceil(chunk));
    let mut lanes = Vec::with_capacity(total);
    let mut scratch = Vec::new();

    for i in 0..total {
        if i % chunk == 0 {
            snapshots.push(state.snapshot());
        }
        let row = state.step_into(topo, i as CommitIdx, &mut scratch);
        lanes.push(row.lane);
    }

    Skeleton {
        chunk,
        snapshots,
        lanes,
        max_lane: state.max_lane(),
    }
}

pub fn window(topo: &Topology, skeleton: &Skeleton, start: usize, len: usize) -> Layout {
    let total = topo.len();
    let from = start.min(total);
    let to = (from + len).min(total);

    let mut out = Layout {
        rows: Vec::new(),
        segments: Vec::new(),
        max_lane: skeleton.max_lane,
    };
    if from >= to {
        return out;
    }

    let chunk_index = from / skeleton.chunk;
    let mut state = match skeleton.snapshots.get(chunk_index) {
        Some(snapshot) => LayoutState::resume(snapshot.clone()),
        None => LayoutState::new(),
    };

    let mut scratch = Vec::new();
    for i in (chunk_index * skeleton.chunk)..from {
        state.step_into(topo, i as CommitIdx, &mut scratch);
    }

    for i in from..to {
        let mut segments = Vec::new();
        let row = state.step_into(topo, i as CommitIdx, &mut segments);
        out.rows.push(row);
        out.segments.push(segments);
    }

    out
}

pub const MINIMAP_LANES: LaneIdx = 32;

pub fn minimap_colours() -> Vec<crate::colour::ColourIdx> {
    (0..MINIMAP_LANES)
        .map(crate::colour::colour_of_lane)
        .collect()
}

pub fn minimap(skeleton: &Skeleton, buckets: usize) -> Vec<u32> {
    const LANES: LaneIdx = MINIMAP_LANES;

    let mut mask = vec![0u32; buckets];
    let total = skeleton.lanes.len();
    if total == 0 || buckets == 0 {
        return mask;
    }

    for (i, &lane) in skeleton.lanes.iter().enumerate() {
        let bucket = (i * buckets / total).min(buckets - 1);
        mask[bucket] |= 1 << lane.min(LANES - 1);
    }
    mask
}

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

pub fn layout_chunked(topo: &Topology, chunk_size: usize) -> (Layout, Vec<Snapshot>) {
    assert!(chunk_size > 0, "chunk size must be positive");

    let mut out = Layout::default();
    let mut snapshots = Vec::new();
    let mut state = LayoutState::new();
    let total = topo.len();

    let mut start = 0usize;
    while start < total {
        let end = (start + chunk_size).min(total);

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
        assert_eq!(
            l.rows.iter().map(|r| r.commit).collect::<Vec<_>>(),
            vec![0, 1, 2, 3, 4, 5]
        );
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
            assert_eq!(
                chunked, whole,
                "resuming from snapshots diverged from the whole run at chunk_size = {chunk_size}"
            );
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
