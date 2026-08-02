use gitspy_core::chunk;
use gitspy_core::topology::{CommitIdx, Topology};
use std::time::{Duration, Instant};

const SMALL: usize = 100_000;
const LARGE: usize = 200_000;
const RUNS: usize = 3;
const LINEAR_RATIO_LIMIT: f64 = 2.8;

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
    Topology::new(parents, vec![0; n]).expect("генератор строит корректную топологию")
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
        .expect("хотя бы один прогон")
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
        "удвоение истории замедлило раскладку в {ratio:.2} раза \
         ({SMALL} — {small_time:?}, {LARGE} — {large_time:?}). \
         Порог {LINEAR_RATIO_LIMIT}: линейный алгоритм даёт около двух, \
         квадратичный около четырёх. Отношение сравнивается внутри одного \
         запуска, поэтому от скорости машины не зависит."
    );
}
