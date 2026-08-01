use gitspy_core::chunk;
use gitspy_core::colour::PALETTE_LEN;
use gitspy_core::layout::{Layout, NodeKind, Segment};
use gitspy_core::topology::{CommitIdx, Topology};
use proptest::prelude::*;
use proptest::strategy::BoxedStrategy;
use std::collections::HashSet;

/// Генерирует корректную топологию: у коммита i родители строго из (i+1..n).
///
/// Порядок родителей НЕ сортируется: в настоящем git первый родитель мержа
/// обычно новее второго, то есть имеет больший индекс. Отсортированный
/// генератор эту форму не порождает, а именно она в фикстуре two_branches.
///
/// Родители за границей набора генерируются тоже — иначе ветка Open
/// не проверяется вовсе.
fn arb_topology() -> impl Strategy<Value = Topology> {
    (1usize..30).prop_flat_map(|n| {
        let rows: Vec<BoxedStrategy<(Vec<CommitIdx>, u32)>> = (0..n)
            .map(|i| {
                let remaining = n - i - 1;
                let known: BoxedStrategy<Vec<CommitIdx>> = if remaining == 0 {
                    Just(Vec::<CommitIdx>::new()).boxed()
                } else {
                    proptest::collection::hash_set((i + 1)..n, 0..=3usize.min(remaining))
                        .prop_map(|set| {
                            set.into_iter().map(|x| x as CommitIdx).collect::<Vec<_>>()
                        })
                        .prop_shuffle()
                        .boxed()
                };
                (known, 0u32..2u32).boxed()
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

/// Дорожки, занятые в ВЕРХНЕЙ половине строки: дорожка узла, сквозные проходы
/// и дорожки, по которым линии приходят сверху и втыкаются в узел.
fn lanes_entering(layout: &Layout, row: usize) -> Vec<u16> {
    let mut lanes = vec![layout.rows[row].lane];
    for segment in &layout.segments[row] {
        match segment {
            Segment::Through { lane, .. } => lanes.push(*lane),
            Segment::Merge { from, .. } => lanes.push(*from),
            Segment::Branch { .. } => {}
        }
    }
    lanes
}

/// Дорожки, занятые в НИЖНЕЙ половине строки: сквозные проходы, дорожки
/// ответвлений и дорожка узла — если линия узла продолжается вниз.
///
/// Ответвление в дорожку, которая уже проходит строку насквозь, не добавляется:
/// это присоединение к той же линии, а не вторая линия на той же дорожке.
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

/// Коммиты, у которых есть хотя бы один потомок в загруженном наборе.
/// У остальных строка — вершина линии, и появление новой дорожки там законно.
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
    fn live_colours_are_distinct_while_the_palette_suffices(topo in arb_topology()) {
        let l = chunk::layout(&topo);
        // Одновременно живых линий не больше, чем дорожек. Пока их меньше размера
        // палитры, запасная ветка ColourAllocator не срабатывает и коллизий быть
        // не может. Проверять при исчерпанной палитре бессмысленно: там коллизия
        // заложена и остаётся с линией навсегда.
        prop_assume!((l.max_lane as usize) + 1 < PALETTE_LEN as usize);
        for row in 0..l.len() {
            let mut colours = vec![l.rows[row].colour];
            for segment in &l.segments[row] {
                match segment {
                    Segment::Through { colour, .. } => colours.push(*colour),
                    Segment::Merge { colour, .. } => colours.push(*colour),
                    Segment::Branch { .. } => {}
                }
            }
            let unique: HashSet<u8> = colours.iter().copied().collect();
            prop_assert_eq!(
                unique.len(),
                colours.len(),
                "строка {} повторяет цвет: {:?}",
                row,
                colours
            );
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
                }
            }
        }
    }

    /// Рёбра обязаны соответствовать настоящим связям, а не просто быть согласованными
    /// между собой: у коммита с N родителями ровно N-1 ответвлений, потому что первый
    /// родитель продолжается в дорожке самого коммита. Ловит и лишнее, и потерянное ребро.
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

    /// Линии непрерывны: набор дорожек, занятых внизу строки, обязан совпасть
    /// с набором занятых наверху следующей — с единственным исключением для
    /// вершины линии, где дорожка законно появляется впервые.
    ///
    /// Это машинная форма инварианта спеки «ребро доходит до настоящего родителя
    /// без разрывов»: оборванное или возникшее из ниоткуда ребро ломает равенство.
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

    /// Главный инвариант всей схемы с полосами и снапшотами.
    #[test]
    fn chunked_layout_equals_whole_layout(topo in arb_topology(), chunk_size in 1usize..17) {
        let whole = chunk::layout(&topo);
        let (chunked, snapshots) = chunk::layout_chunked(&topo, chunk_size);
        prop_assert_eq!(&chunked, &whole);
        let expected_snapshots = topo.len().div_ceil(chunk_size);
        prop_assert_eq!(snapshots.len(), expected_snapshots);
    }
}
