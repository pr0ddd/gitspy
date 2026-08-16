use gitspy_core::chunk;
use gitspy_core::topology::{CommitIdx, Topology};
use std::time::{Duration, Instant};

const SMALL: usize = 100_000;
const LARGE: usize = 200_000;
const RUNS: usize = 3;
const LINEAR_RATIO_LIMIT: f64 = 2.8;
const WIDTH_RATIO_SLACK: f64 = 1.5;

fn branchy(n: usize) -> Topology {
    let mut parents = Vec::with_capacity(n);
    for i in 0..n {
        let mut ids = Vec::new();
        if i + 1 < n {
            ids.push((i + 1) as CommitIdx);
        }
        if i % 7 == 0 {
            let far = i + 3 + (i % 23);
            if far < n {
                ids.push(far as CommitIdx);
            }
        }
        ids.sort_unstable();
        ids.dedup();
        parents.push(ids);
    }
    Topology::new(parents, vec![0; n]).expect("the generator builds a valid topology")
}

fn wide(n: usize, span: usize) -> Topology {
    let mut parents = Vec::with_capacity(n);
    for i in 0..n {
        let mut ids = Vec::new();
        if i + 1 < n {
            ids.push((i + 1) as CommitIdx);
        }
        if i % 3 == 0 {
            let far = i + 2 + (i % span);
            if far < n {
                ids.push(far as CommitIdx);
            }
        }
        ids.sort_unstable();
        ids.dedup();
        parents.push(ids);
    }
    Topology::new(parents, vec![0; n]).expect("the generator builds a valid topology")
}

fn fastest_layout(topo: &Topology) -> Duration {
    (0..RUNS)
        .map(|_| {
            let started = Instant::now();
            let layout = chunk::layout(topo);
            std::hint::black_box(layout.max_lane);
            started.elapsed()
        })
        .min()
        .expect("at least one run")
}

#[test]
fn layout_stays_linear_in_the_number_of_commits() {
    let small = branchy(SMALL);
    let large = branchy(LARGE);

    std::hint::black_box(fastest_layout(&small));

    let small_time = fastest_layout(&small);
    let large_time = fastest_layout(&large);
    let ratio = large_time.as_secs_f64() / small_time.as_secs_f64();

    assert!(
        ratio < LINEAR_RATIO_LIMIT,
        "doubling the history made layout {ratio:.2} times slower \
         ({SMALL}: {small_time:?}, {LARGE}: {large_time:?}). \
         The limit is {LINEAR_RATIO_LIMIT}: a linear algorithm gives about two, \
         a quadratic one about four. The ratio is measured within a single \
         run, so it does not depend on the speed of the machine."
    );
}

#[test]
fn layout_stays_linear_in_the_width_of_the_graph() {
    let narrow = wide(SMALL, 200);
    let broad = wide(SMALL, 800);

    std::hint::black_box(fastest_layout(&narrow));

    let narrow_lanes = chunk::layout(&narrow).max_lane as f64 + 1.0;
    let broad_lanes = chunk::layout(&broad).max_lane as f64 + 1.0;
    let widening = broad_lanes / narrow_lanes;

    let narrow_time = fastest_layout(&narrow);
    let broad_time = fastest_layout(&broad);
    let slowdown = broad_time.as_secs_f64() / narrow_time.as_secs_f64();

    assert!(
        slowdown < widening * WIDTH_RATIO_SLACK,
        "the graph is {widening:.1} times wider, but layout is {slowdown:.1} times slower \
         ({narrow_lanes} lanes: {narrow_time:?}, {broad_lanes} lanes: {broad_time:?}). \
         Every row emits one segment per open lane, so the cost grows linearly \
         with the width; quadratic growth means an extra pass over the lanes."
    );
}
