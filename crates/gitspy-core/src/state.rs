use crate::colour::{colour_of_lane, ColourIdx};
use crate::layout::{LaneIdx, NodeKind, Row, Segment};
use crate::topology::{CommitIdx, Topology};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LaneState {
    Free,

    WaitingFor(CommitIdx),

    Open,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LayoutState {
    pub(crate) lanes: Vec<LaneState>,

    pub(crate) sides: Vec<bool>,
    pub(crate) max_lane: LaneIdx,
}

impl LayoutState {
    pub fn new() -> Self {
        Self {
            lanes: Vec::new(),
            sides: Vec::new(),
            max_lane: 0,
        }
    }

    pub fn max_lane(&self) -> LaneIdx {
        self.max_lane
    }

    fn first_free_lane(&mut self) -> LaneIdx {
        if let Some(idx) = self.lanes.iter().position(|l| *l == LaneState::Free) {
            return idx as LaneIdx;
        }
        self.lanes.push(LaneState::Free);
        self.sides.push(false);
        (self.lanes.len() - 1) as LaneIdx
    }

    fn open_line(&mut self, waiting_for: LaneState, side: bool) -> (LaneIdx, ColourIdx) {
        let lane = self.first_free_lane();
        self.lanes[lane as usize] = waiting_for;
        self.sides[lane as usize] = side;
        self.max_lane = self.max_lane.max(lane);
        (lane, colour_of_lane(lane))
    }

    pub fn step(&mut self, topo: &Topology, commit: CommitIdx) -> (Row, Vec<Segment>) {
        let mut segments = Vec::new();
        let row = self.step_into(topo, commit, &mut segments);
        (row, segments)
    }

    pub fn step_into(
        &mut self,
        topo: &Topology,
        commit: CommitIdx,
        segments: &mut Vec<Segment>,
    ) -> Row {
        segments.clear();

        let waiting: Vec<LaneIdx> = self
            .lanes
            .iter()
            .enumerate()
            .filter(|(_, l)| **l == LaneState::WaitingFor(commit))
            .map(|(i, _)| i as LaneIdx)
            .collect();
        let own_lane = match waiting
            .iter()
            .copied()
            .find(|l| self.sides[*l as usize])
            .or_else(|| waiting.first().copied())
        {
            Some(lane) => lane,
            None => self.open_line(LaneState::WaitingFor(commit), false).0,
        };
        let colour = colour_of_lane(own_lane);
        self.max_lane = self.max_lane.max(own_lane);

        for (idx, state) in self.lanes.iter().enumerate() {
            let lane = idx as LaneIdx;
            if lane == own_lane || *state == LaneState::Free {
                continue;
            }
            if *state != LaneState::WaitingFor(commit) {
                segments.push(Segment::Through {
                    lane,
                    colour: colour_of_lane(lane),
                });
            }
        }

        for idx in 0..self.lanes.len() {
            let lane = idx as LaneIdx;
            if lane == own_lane {
                continue;
            }
            if self.lanes[idx] == LaneState::WaitingFor(commit) {
                segments.push(Segment::Merge {
                    from: lane,
                    to: own_lane,
                    colour: colour_of_lane(lane),
                });
                self.lanes[idx] = LaneState::Free;
                self.sides[idx] = false;
            }
        }

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
            self.sides[own_lane as usize] = false;
        } else if known.is_empty() {
            self.lanes[own_lane as usize] = LaneState::Open;
            self.sides[own_lane as usize] = false;
            for _ in 1..outside {
                let (lane, c) = self.open_line(LaneState::Open, true);
                segments.push(Segment::Branch {
                    from: own_lane,
                    to: lane,
                    colour: c,
                });
            }
        } else {
            self.lanes[own_lane as usize] = LaneState::WaitingFor(known[0]);
            self.sides[own_lane as usize] = false;
            for &parent in &known[1..] {
                let existing = self
                    .lanes
                    .iter()
                    .position(|l| *l == LaneState::WaitingFor(parent))
                    .map(|i| i as LaneIdx);
                match existing {
                    Some(lane) => {
                        segments.push(Segment::Branch {
                            from: own_lane,
                            to: lane,
                            colour: colour_of_lane(lane),
                        });
                    }
                    None => {
                        let (lane, c) = self.open_line(LaneState::WaitingFor(parent), true);
                        segments.push(Segment::Branch {
                            from: own_lane,
                            to: lane,
                            colour: c,
                        });
                    }
                }
            }
            for _ in 0..outside {
                let (lane, c) = self.open_line(LaneState::Open, true);
                segments.push(Segment::Branch {
                    from: own_lane,
                    to: lane,
                    colour: c,
                });
            }
        }

        Row {
            commit,
            lane: own_lane,
            colour,
            kind,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshot {
    lanes: Vec<LaneState>,
    sides: Vec<bool>,
    max_lane: LaneIdx,
}

impl LayoutState {
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            lanes: self.lanes.clone(),
            sides: self.sides.clone(),
            max_lane: self.max_lane,
        }
    }

    pub fn resume(snapshot: Snapshot) -> Self {
        Self {
            lanes: snapshot.lanes,
            sides: snapshot.sides,
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
        assert_eq!(
            rows.iter().map(|r| r.lane).collect::<Vec<_>>(),
            vec![0, 0, 0]
        );
        assert_eq!(
            rows.iter().map(|r| r.colour).collect::<Vec<_>>(),
            vec![0, 0, 0]
        );
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
        let (rows, segs) = run("m: a, b\na: r\nb: r\nr\n");
        assert_eq!(rows[0].lane, 0);
        assert_eq!(rows[0].kind, NodeKind::Merge);
        assert_eq!(
            segs[0],
            vec![Segment::Branch {
                from: 0,
                to: 1,
                colour: 1
            }]
        );
        assert_eq!(rows[1].lane, 0);
        assert_eq!(rows[2].lane, 1);
        assert_eq!(rows[2].colour, 1);
    }

    #[test]
    fn converging_lane_emits_merge_and_frees_the_lane() {
        let (rows, segs) = run("m: a, b\na: r\nb: r\nr\n");

        assert_eq!(rows[3].lane, 0);
        assert_eq!(
            segs[3],
            vec![Segment::Merge {
                from: 1,
                to: 0,
                colour: 1
            }]
        );
    }

    #[test]
    fn passing_lane_emits_through() {
        let (_, segs) = run("m: a, b\na: r\nb: r\nr\n");

        assert_eq!(segs[2], vec![Segment::Through { lane: 0, colour: 0 }]);
    }

    #[test]
    fn a_lane_keeps_one_colour_for_every_line_that_occupies_it() {
        let src = "m4: m3\nm3: m2, b1\nb1: m2\nm2: m1, a1\na1: m1\nm1\n";
        let (rows, _) = run(src);
        let b1 = rows[2];
        let a1 = rows[4];
        assert_eq!(b1.lane, 1);
        assert_eq!(a1.lane, 1, "вторая ветка переиспользует дорожку 1");
        assert_eq!(b1.colour, 1);
        assert_eq!(a1.colour, 1, "и получает тот же цвет, что и первая");

        for row in rows.iter().filter(|r| r.lane == 0) {
            assert_eq!(row.colour, 0);
        }
    }

    #[test]
    fn octopus_merge_opens_a_lane_per_extra_parent() {
        let (rows, segs) = run("m: a, b, c\na: r\nb: r\nc: r\nr\n");
        assert_eq!(rows[0].kind, NodeKind::Merge);
        assert_eq!(
            segs[0],
            vec![
                Segment::Branch {
                    from: 0,
                    to: 1,
                    colour: 1
                },
                Segment::Branch {
                    from: 0,
                    to: 2,
                    colour: 2
                },
            ]
        );
    }

    #[test]
    fn extra_parent_joins_a_lane_already_waiting_for_it() {
        let (rows, segs) = run("a: d\nb: c, d\nc\nd\n");
        assert_eq!(rows[1].lane, 1);
        assert_eq!(rows[1].colour, 1);
        assert_eq!(
            segs[1],
            vec![
                Segment::Through { lane: 0, colour: 0 },
                Segment::Branch {
                    from: 1,
                    to: 0,
                    colour: 0
                },
            ]
        );
    }

    #[test]
    fn landing_commit_goes_to_the_side_lane_not_the_leftmost() {
        let (rows, segs) = run("a: w, s\nw: s\ns\n");
        assert_eq!(rows[0].lane, 0, "мерж на магистрали");
        assert_eq!(
            segs[0],
            vec![Segment::Branch {
                from: 0,
                to: 1,
                colour: 1
            }]
        );
        assert_eq!(rows[1].lane, 0, "первый родитель продолжает магистраль");
        assert_eq!(
            rows[2].lane, 1,
            "s приземляется в боковой дорожке, а не в нулевой"
        );
        assert_eq!(
            segs[2],
            vec![Segment::Merge {
                from: 0,
                to: 1,
                colour: 0
            }]
        );
    }

    #[test]
    fn side_priority_expires_once_the_line_moves_on() {
        let src = "m4: m3\nm3: m2, b1\nb1: m2\nm2: m1, a1\na1: m1\nm1\n";
        let (rows, _) = run(src);
        assert_eq!(
            rows.iter().map(|r| r.lane).collect::<Vec<_>>(),
            vec![0, 0, 1, 0, 1, 0],
            "ствол держится нулевой дорожки на всём протяжении"
        );
    }

    #[test]
    fn outside_parent_opens_a_lane_that_runs_off_the_bottom() {
        let (rows, segs) = run("m: a, ?\na\n");
        assert_eq!(rows[0].kind, NodeKind::Merge);
        assert_eq!(
            segs[0],
            vec![Segment::Branch {
                from: 0,
                to: 1,
                colour: 1
            }]
        );

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
