use crate::colour::{ColourAllocator, ColourIdx};
use crate::layout::{LaneIdx, NodeKind, Row, Segment};
use crate::topology::{CommitIdx, Topology};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LaneState {
    Free,
    /// Дорожка занята линией, которая спускается к этому коммиту.
    WaitingFor(CommitIdx),
    /// Дорожка занята линией, уходящей за нижнюю границу загруженного набора.
    Open,
}

/// Вся изменяемая память алгоритма раскладки.
///
/// Снапшот полосы — это ровно содержимое `LayoutState`; ничего сверх него
/// алгоритм между шагами не помнит.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LayoutState {
    pub(crate) lanes: Vec<LaneState>,
    pub(crate) colours: Vec<Option<ColourIdx>>,
    pub(crate) colour_alloc: ColourAllocator,
    pub(crate) max_lane: LaneIdx,
}

impl LayoutState {
    pub fn new() -> Self {
        Self {
            lanes: Vec::new(),
            colours: Vec::new(),
            colour_alloc: ColourAllocator::new(),
            max_lane: 0,
        }
    }

    pub fn max_lane(&self) -> LaneIdx {
        self.max_lane
    }

    fn live_colours(&self) -> Vec<ColourIdx> {
        self.lanes
            .iter()
            .zip(self.colours.iter())
            .filter(|(state, _)| !matches!(state, LaneState::Free))
            .filter_map(|(_, colour)| *colour)
            .collect()
    }

    fn first_free_lane(&mut self) -> LaneIdx {
        if let Some(idx) = self.lanes.iter().position(|l| *l == LaneState::Free) {
            return idx as LaneIdx;
        }
        self.lanes.push(LaneState::Free);
        self.colours.push(None);
        (self.lanes.len() - 1) as LaneIdx
    }

    /// Занимает свободную дорожку под новую линию и выдаёт ей цвет.
    fn open_line(&mut self, waiting_for: LaneState) -> (LaneIdx, ColourIdx) {
        let live = self.live_colours();
        let colour = self.colour_alloc.next(&live);
        let lane = self.first_free_lane();
        self.lanes[lane as usize] = waiting_for;
        self.colours[lane as usize] = Some(colour);
        self.max_lane = self.max_lane.max(lane);
        (lane, colour)
    }

    pub fn step(&mut self, topo: &Topology, commit: CommitIdx) -> (Row, Vec<Segment>) {
        let mut segments = Vec::new();

        // 1. Своя дорожка: крайняя левая из ожидающих этот коммит, иначе новая линия.
        let own_lane = match self
            .lanes
            .iter()
            .position(|l| *l == LaneState::WaitingFor(commit))
        {
            Some(idx) => idx as LaneIdx,
            None => self.open_line(LaneState::WaitingFor(commit)).0,
        };
        let colour = self.colours[own_lane as usize].expect("занятая дорожка имеет цвет");
        self.max_lane = self.max_lane.max(own_lane);

        // 2. Сегменты сквозного прохода — до того, как сходящиеся дорожки освободятся.
        for (idx, state) in self.lanes.iter().enumerate() {
            let lane = idx as LaneIdx;
            if lane == own_lane || *state == LaneState::Free {
                continue;
            }
            if *state != LaneState::WaitingFor(commit) {
                if let Some(c) = self.colours[idx] {
                    segments.push(Segment::Through { lane, colour: c });
                }
            }
        }

        // 3. Сходящиеся дорожки освобождаются, каждая даёт Merge.
        for idx in 0..self.lanes.len() {
            let lane = idx as LaneIdx;
            if lane == own_lane {
                continue;
            }
            if self.lanes[idx] == LaneState::WaitingFor(commit) {
                if let Some(c) = self.colours[idx] {
                    segments.push(Segment::Merge { from: lane, to: own_lane, colour: c });
                }
                self.lanes[idx] = LaneState::Free;
                self.colours[idx] = None;
            }
        }

        // 4. Родители.
        let known = topo.parents(commit);
        let outside = topo.outside_parents(commit);
        let total = known.len() as u32 + outside;

        let kind = if total == 0 {
            NodeKind::Root
        } else if total > 1 {
            NodeKind::Merge
        } else if known.is_empty() {
            NodeKind::Open
        } else {
            NodeKind::Normal
        };

        if total == 0 {
            self.lanes[own_lane as usize] = LaneState::Free;
            self.colours[own_lane as usize] = None;
        } else if known.is_empty() {
            // все родители за границей набора
            self.lanes[own_lane as usize] = LaneState::Open;
            for _ in 1..outside {
                let (lane, c) = self.open_line(LaneState::Open);
                segments.push(Segment::Branch { from: own_lane, to: lane, colour: c });
            }
        } else {
            self.lanes[own_lane as usize] = LaneState::WaitingFor(known[0]);
            for &parent in &known[1..] {
                let existing = self
                    .lanes
                    .iter()
                    .position(|l| *l == LaneState::WaitingFor(parent))
                    .map(|i| i as LaneIdx);
                match existing {
                    Some(lane) => {
                        let c = self.colours[lane as usize].expect("занятая дорожка имеет цвет");
                        segments.push(Segment::Branch { from: own_lane, to: lane, colour: c });
                    }
                    None => {
                        let (lane, c) = self.open_line(LaneState::WaitingFor(parent));
                        segments.push(Segment::Branch { from: own_lane, to: lane, colour: c });
                    }
                }
            }
            for _ in 0..outside {
                let (lane, c) = self.open_line(LaneState::Open);
                segments.push(Segment::Branch { from: own_lane, to: lane, colour: c });
            }
        }

        let row = Row { commit, lane: own_lane, colour, kind };
        (row, segments)
    }
}

/// Состояние раскладки на границе полосы.
///
/// Отдельный тип, а не псевдоним `LayoutState`: тест «целиком == по полосам»
/// проверяет именно то, что снапшот ничего не забыл.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshot {
    lanes: Vec<LaneState>,
    colours: Vec<Option<ColourIdx>>,
    colour_cursor: u32,
    max_lane: LaneIdx,
}

impl LayoutState {
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            lanes: self.lanes.clone(),
            colours: self.colours.clone(),
            colour_cursor: self.colour_alloc.cursor(),
            max_lane: self.max_lane,
        }
    }

    pub fn resume(snapshot: Snapshot) -> Self {
        Self {
            lanes: snapshot.lanes,
            colours: snapshot.colours,
            colour_alloc: ColourAllocator::from_cursor(snapshot.colour_cursor),
            max_lane: snapshot.max_lane,
        }
    }
}

impl Default for LayoutState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixture;

    /// Прогоняет всю топологию через LayoutState, возвращая строки и сегменты.
    fn run(src: &str) -> (Vec<Row>, Vec<Vec<Segment>>) {
        let parsed = fixture::parse(src).unwrap();
        let mut state = LayoutState::new();
        let mut rows = Vec::new();
        let mut segments = Vec::new();
        for i in 0..parsed.topology.len() as CommitIdx {
            let (row, segs) = state.step(&parsed.topology, i);
            rows.push(row);
            segments.push(segs);
        }
        (rows, segments)
    }

    #[test]
    fn linear_history_stays_in_lane_zero() {
        let (rows, segs) = run("a: b\nb: c\nc\n");
        assert_eq!(rows.iter().map(|r| r.lane).collect::<Vec<_>>(), vec![0, 0, 0]);
        assert_eq!(rows.iter().map(|r| r.colour).collect::<Vec<_>>(), vec![0, 0, 0]);
        assert_eq!(rows[2].kind, NodeKind::Root);
        assert!(segs.iter().all(|s| s.is_empty()));
    }

    #[test]
    fn root_frees_its_lane() {
        let (rows, _) = run("a\n");
        assert_eq!(rows[0].kind, NodeKind::Root);
    }

    #[test]
    fn commit_with_only_outside_parents_is_open() {
        let (rows, _) = run("a: ?\n");
        assert_eq!(rows[0].kind, NodeKind::Open);
    }

    #[test]
    fn branch_takes_the_next_lane_and_a_new_colour() {
        // m ветвится на a (первый родитель, остаётся в дорожке 0) и b (уходит в дорожку 1)
        let (rows, segs) = run("m: a, b\na: r\nb: r\nr\n");
        assert_eq!(rows[0].lane, 0);
        assert_eq!(rows[0].kind, NodeKind::Merge);
        assert_eq!(segs[0], vec![Segment::Branch { from: 0, to: 1, colour: 1 }]);
        assert_eq!(rows[1].lane, 0);
        assert_eq!(rows[2].lane, 1);
        assert_eq!(rows[2].colour, 1);
    }

    #[test]
    fn converging_lane_emits_merge_and_frees_the_lane() {
        let (rows, segs) = run("m: a, b\na: r\nb: r\nr\n");
        // строка 3 — r, в неё сходятся дорожки 0 и 1
        assert_eq!(rows[3].lane, 0);
        assert_eq!(segs[3], vec![Segment::Merge { from: 1, to: 0, colour: 1 }]);
    }

    #[test]
    fn passing_lane_emits_through() {
        let (_, segs) = run("m: a, b\na: r\nb: r\nr\n");
        // строка 2 — b в дорожке 1; дорожка 0 ждёт r и проходит строку насквозь
        assert_eq!(segs[2], vec![Segment::Through { lane: 0, colour: 0 }]);
    }

    #[test]
    fn two_sequential_branches_get_different_colours() {
        // Главная регрессия: в старом движке обе ветки получали дорожку 1 и один цвет.
        // Дорожка переиспользуется — это правильно; цвет переиспользоваться не должен.
        let src = "m4: m3\nm3: m2, b1\nb1: m2\nm2: m1, a1\na1: m1\nm1\n";
        let (rows, _) = run(src);
        let b1 = rows[2];
        let a1 = rows[4];
        assert_eq!(b1.lane, 1, "первая ветка занимает дорожку 1");
        assert_eq!(a1.lane, 1, "вторая ветка переиспользует дорожку 1");
        assert_ne!(a1.colour, b1.colour, "но цвет обязан отличаться");
        assert_eq!(b1.colour, 1);
        assert_eq!(a1.colour, 2);
    }

    #[test]
    fn octopus_merge_opens_a_lane_per_extra_parent() {
        let (rows, segs) = run("m: a, b, c\na: r\nb: r\nc: r\nr\n");
        assert_eq!(rows[0].kind, NodeKind::Merge);
        assert_eq!(
            segs[0],
            vec![
                Segment::Branch { from: 0, to: 1, colour: 1 },
                Segment::Branch { from: 0, to: 2, colour: 2 },
            ]
        );
    }

    #[test]
    fn extra_parent_joins_a_lane_already_waiting_for_it() {
        // Ветка `Some(lane)`: у b второй родитель d, а дорожка 0 уже ждёт d ради a.
        // Новая дорожка не создаётся — ответвление втыкается в существующую линию,
        // поэтому и цвет у него не новый, а цвет той линии.
        let (rows, segs) = run("a: d\nb: c, d\nc\nd\n");
        assert_eq!(rows[1].lane, 1);
        assert_eq!(rows[1].colour, 1);
        assert_eq!(
            segs[1],
            vec![
                Segment::Through { lane: 0, colour: 0 },
                Segment::Branch { from: 1, to: 0, colour: 0 },
            ]
        );
    }

    #[test]
    fn outside_parent_opens_a_lane_that_runs_off_the_bottom() {
        // У m один известный родитель a и один за границей набора.
        let (rows, segs) = run("m: a, ?\na\n");
        assert_eq!(rows[0].kind, NodeKind::Merge);
        assert_eq!(segs[0], vec![Segment::Branch { from: 0, to: 1, colour: 1 }]);
        // дорожка 1 продолжает идти вниз и после того, как a стал корнем
        assert_eq!(rows[1].kind, NodeKind::Root);
        assert_eq!(segs[1], vec![Segment::Through { lane: 1, colour: 1 }]);
    }

    #[test]
    fn max_lane_tracks_the_widest_point() {
        let parsed = fixture::parse("m: a, b, c\na: r\nb: r\nc: r\nr\n").unwrap();
        let mut state = LayoutState::new();
        for i in 0..parsed.topology.len() as CommitIdx {
            state.step(&parsed.topology, i);
        }
        assert_eq!(state.max_lane(), 2);
    }
}
