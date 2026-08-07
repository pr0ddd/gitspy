use gitspy_core::chunk;
use gitspy_core::colour::colour_of_lane;
use gitspy_core::layout::{LaneIdx, Layout, NodeKind, Segment};
use gitspy_core::topology::{CommitIdx, Topology};
use proptest::prelude::*;
use proptest::strategy::BoxedStrategy;
use std::collections::{HashMap, HashSet};

const MAX_PARENTS: usize = 6;

fn arb_topology() -> impl Strategy<Value = Topology> {
    (1usize..30).prop_flat_map(|n| {
        let rows: Vec<BoxedStrategy<(Vec<CommitIdx>, u32)>> = (0..n)
            .map(|i| {
                let remaining = n - i - 1;
                let known: BoxedStrategy<Vec<CommitIdx>> = if remaining == 0 {
                    Just(Vec::<CommitIdx>::new()).boxed()
                } else {
                    proptest::collection::hash_set((i + 1)..n, 0..=MAX_PARENTS.min(remaining))
                        .prop_map(|set| set.into_iter().map(|x| x as CommitIdx).collect::<Vec<_>>())
                        .prop_shuffle()
                        .boxed()
                };
                (known, 0u32..3u32).boxed()
            })
            .collect();
        rows.prop_map(|rows| {
            let mut parents = Vec::with_capacity(rows.len());
            let mut outside = Vec::with_capacity(rows.len());
            for (known, outside_count) in rows {
                parents.push(known);
                outside.push(outside_count);
            }
            Topology::new(parents, outside).expect("генератор строит корректную топологию")
        })
    })
}

fn lanes_entering(layout: &Layout, row: usize) -> Vec<u16> {
    let mut lanes = vec![layout.rows[row].lane];
    for segment in &layout.segments[row] {
        match segment {
            Segment::Through { lane, .. } => lanes.push(*lane),
            Segment::Merge { from, .. } => lanes.push(*from),
            Segment::Branch { .. } => {}
            Segment::StemUp { .. } | Segment::StemDown { .. } => {}
        }
    }
    lanes
}

fn lanes_leaving(layout: &Layout, row: usize) -> Vec<u16> {
    let through: Vec<u16> = layout.segments[row]
        .iter()
        .filter_map(|s| match s {
            Segment::Through { lane, .. } => Some(*lane),
            _ => None,
        })
        .collect();

    let mut lanes = Vec::new();
    if layout.rows[row].kind != NodeKind::Root {
        lanes.push(layout.rows[row].lane);
    }
    lanes.extend(through.iter().copied());
    for segment in &layout.segments[row] {
        if let Segment::Branch { to, .. } = segment {
            if !through.contains(to) {
                lanes.push(*to);
            }
        }
    }
    lanes
}

fn as_set(lanes: &[u16]) -> HashSet<u16> {
    lanes.iter().copied().collect()
}

fn side_lane_violation(layout: &Layout) -> Option<String> {
    let mut opened_as_side: HashMap<LaneIdx, bool> = HashMap::new();

    for row in 0..layout.len() {
        let node_lane = layout.rows[row].lane;
        let mut merging_in = Vec::new();
        let mut passing_through = Vec::new();
        let mut branch_targets = Vec::new();
        for segment in &layout.segments[row] {
            match segment {
                Segment::Merge { from, .. } => merging_in.push(*from),
                Segment::Through { lane, .. } => passing_through.push(*lane),
                Segment::Branch { to, .. } => branch_targets.push(*to),
                Segment::StemUp { .. } | Segment::StemDown { .. } => {}
            }
        }

        let is_side = |lane: &LaneIdx| opened_as_side.get(lane) == Some(&true);
        let awaiting: Vec<LaneIdx> = std::iter::once(node_lane)
            .chain(merging_in.iter().copied())
            .collect();
        if awaiting.iter().any(is_side) && !is_side(&node_lane) {
            return Some(format!(
                "строка {row}: узел сел на магистральную дорожку {node_lane}, \
                 хотя его ждала боковая среди {awaiting:?}"
            ));
        }

        for lane in merging_in {
            opened_as_side.remove(&lane);
        }
        if layout.rows[row].kind == NodeKind::Root {
            opened_as_side.remove(&node_lane);
        } else {
            opened_as_side.insert(node_lane, false);
        }
        for target in branch_targets {
            if !passing_through.contains(&target) {
                opened_as_side.insert(target, true);
            }
        }
    }

    None
}

fn commits_with_children(topo: &Topology) -> HashSet<CommitIdx> {
    let mut set = HashSet::new();
    for i in 0..topo.len() as CommitIdx {
        for &p in topo.parents(i) {
            set.insert(p);
        }
    }
    set
}

proptest! {
    #[test]
    fn every_commit_gets_exactly_one_row_in_order(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        prop_assert_eq!(l.rows.len(), topo.len());
        prop_assert_eq!(l.segments.len(), topo.len());
        for (i, row) in l.rows.iter().enumerate() {
            prop_assert_eq!(row.commit, i as CommitIdx);
        }
    }

    #[test]
    fn no_two_lines_share_a_lane_in_the_same_half_row(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        for row in 0..l.len() {
            for (half, lanes) in [
                ("верх", lanes_entering(&l, row)),
                ("низ", lanes_leaving(&l, row)),
            ] {
                let unique = as_set(&lanes);
                prop_assert_eq!(
                    unique.len(),
                    lanes.len(),
                    "строка {} ({}) занимает дорожку дважды: {:?}",
                    row,
                    half,
                    lanes
                );
            }
        }
    }

    #[test]
    fn colour_is_a_pure_function_of_the_lane(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        for row in 0..l.len() {
            prop_assert_eq!(
                l.rows[row].colour,
                colour_of_lane(l.rows[row].lane),
                "строка {}: цвет узла не совпал с цветом его дорожки",
                row
            );
            for segment in &l.segments[row] {
                let (lane, colour) = match segment {
                    Segment::Through { lane, colour } => (*lane, *colour),
                    Segment::Branch { to, colour, .. } => (*to, *colour),
                    Segment::Merge { from, colour, .. } => (*from, *colour),
                    Segment::StemUp { lane, colour } | Segment::StemDown { lane, colour } => {
                        (*lane, *colour)
                    }
                };
                prop_assert_eq!(
                    colour,
                    colour_of_lane(lane),
                    "строка {}: {:?} не в цвете своей дорожки {}",
                    row,
                    segment,
                    lane
                );
            }
        }
    }

    #[test]
    fn a_landing_commit_prefers_the_side_lane_over_the_leftmost(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        if let Some(violation) = side_lane_violation(&l) {
            prop_assert!(false, "{}", violation);
        }
    }

    #[test]
    fn every_edge_touches_the_node_lane(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        for row in 0..l.len() {
            let node_lane = l.rows[row].lane;
            for segment in &l.segments[row] {
                match segment {
                    Segment::Merge { to, from, .. } => {
                        prop_assert_eq!(*to, node_lane);
                        prop_assert_ne!(*from, node_lane);
                    }
                    Segment::Branch { from, to, .. } => {
                        prop_assert_eq!(*from, node_lane);
                        prop_assert_ne!(*to, node_lane);
                    }
                    Segment::Through { lane, .. } => {
                        prop_assert_ne!(*lane, node_lane);
                    }
                    Segment::StemUp { lane, .. } | Segment::StemDown { lane, .. } => {
                        prop_assert_eq!(*lane, node_lane);
                    }
                }
            }
        }
    }

    #[test]
    fn branch_count_matches_parent_count(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        for row in 0..l.len() {
            let commit = l.rows[row].commit;
            let total_parents =
                topo.parents(commit).len() as u32 + topo.outside_parents(commit);
            let branches = l.segments[row]
                .iter()
                .filter(|s| matches!(s, Segment::Branch { .. }))
                .count() as u32;
            let expected = total_parents.saturating_sub(1);
            prop_assert_eq!(
                branches,
                expected,
                "коммит {} имеет {} родителей, но {} ответвлений",
                commit,
                total_parents,
                branches
            );
        }
    }

    #[test]
    fn lines_are_continuous_between_rows(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        let has_children = commits_with_children(&topo);
        for row in 0..l.len().saturating_sub(1) {
            let leaving = as_set(&lanes_leaving(&l, row));
            let entering = as_set(&lanes_entering(&l, row + 1));

            for lane in leaving.difference(&entering) {
                prop_assert!(
                    false,
                    "линия на дорожке {} обрывается между строками {} и {}",
                    lane,
                    row,
                    row + 1
                );
            }

            let next = l.rows[row + 1];
            for lane in entering.difference(&leaving) {
                prop_assert_eq!(
                    *lane,
                    next.lane,
                    "в строке {} дорожка {} возникла не под узлом",
                    row + 1,
                    lane
                );
                prop_assert!(
                    !has_children.contains(&next.commit),
                    "в строке {} новая линия открыта под коммитом, у которого есть потомки",
                    row + 1
                );
            }
        }
    }

    #[test]
    fn chunked_layout_equals_whole_layout(topo in arb_topology(), chunk_size in 1usize..17) {
        let whole = chunk::layout(&topo);
        let (chunked, snapshots) = chunk::layout_chunked(&topo, chunk_size);
        prop_assert_eq!(&chunked, &whole);
        let expected_snapshots = topo.len().div_ceil(chunk_size);
        prop_assert_eq!(snapshots.len(), expected_snapshots);
    }
}

proptest! {
    #[test]
    fn a_window_equals_the_same_slice_of_the_whole_layout(
        topo in arb_topology(),
        chunk in 1usize..9,
        start in 0usize..30,
        len in 0usize..12,
    ) {
        let whole = chunk::layout(&topo);
        let skeleton = chunk::skeleton(&topo, chunk);
        let window = chunk::window(&topo, &skeleton, start, len);

        let from = start.min(whole.len());
        let to = (from + len).min(whole.len());

        prop_assert_eq!(window.rows.as_slice(), &whole.rows[from..to]);
        prop_assert_eq!(window.segments.as_slice(), &whole.segments[from..to]);
        prop_assert_eq!(window.max_lane, whole.max_lane);
    }

    #[test]
    fn the_skeleton_knows_every_lane_without_building_segments(
        topo in arb_topology(),
        chunk in 1usize..9,
    ) {
        let whole = chunk::layout(&topo);
        let skeleton = chunk::skeleton(&topo, chunk);

        prop_assert_eq!(skeleton.len(), whole.len());
        prop_assert_eq!(skeleton.max_lane, whole.max_lane);
        for (i, row) in whole.rows.iter().enumerate() {
            prop_assert_eq!(skeleton.lanes[i], row.lane, "строка {}", i);
        }
    }
}
