use gitspy_core::chunk;
use gitspy_core::topology::{CommitIdx, Topology};
use std::time::Instant;

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
    Topology::new(parents, vec![0; n]).expect("корректная топология")
}

fn main() {
    let n: usize = std::env::args()
        .nth(1)
        .and_then(|a| a.parse().ok())
        .unwrap_or(1_000_000);

    for span in [8usize, 200, 700, 2000] {
        let topo = wide(n, span);
        let started = Instant::now();
        let layout = chunk::layout(&topo);
        let elapsed = started.elapsed().as_secs_f64() * 1000.0;
        println!(
            "коммитов {n}  дорожек {:<5}  раскладка {elapsed:.0} мс",
            layout.max_lane as usize + 1
        );
    }
}
