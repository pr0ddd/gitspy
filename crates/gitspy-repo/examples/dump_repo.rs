use gitspy_core::{chunk, dump};
use gitspy_exec::Git;
use gitspy_repo::RefSeed;
use std::time::Instant;

fn seeds_of(path: &std::path::Path) -> (Vec<RefSeed>, Option<String>, usize, f64) {
    let git = Git::discover().expect("git found on the system");
    let cold = git.refs(path).expect("refs read");
    drop(cold);

    let started = Instant::now();
    let found = git.refs(path).expect("refs read");
    let head = found
        .iter()
        .find(|r| r.is_head)
        .map(|r| r.oid.clone())
        .or_else(|| git.head_oid(path));
    let refs_ms = started.elapsed().as_secs_f64() * 1000.0;

    let count = found.len();
    let seeds = found
        .into_iter()
        .map(|r| RefSeed {
            is_stash: r.kind == gitspy_exec::refs::RefKind::Stash,
            oid: r.oid,
        })
        .collect();
    (seeds, head, count, refs_ms)
}

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().unwrap_or_else(|| ".".to_string());
    let show: usize = args.next().and_then(|s| s.parse().ok()).unwrap_or(20);

    let (seeds, head, ref_count, refs_ms) = seeds_of(std::path::Path::new(&path));

    let t0 = Instant::now();
    let history =
        match gitspy_repo::read(std::path::Path::new(&path), None, &seeds, head.as_deref()) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("error: {e}");
                std::process::exit(1);
            }
        };
    let read_ms = t0.elapsed().as_secs_f64() * 1000.0;

    let t1 = Instant::now();
    let layout = chunk::layout(&history.topology);
    let layout_ms = t1.elapsed().as_secs_f64() * 1000.0;

    let mut with_outside = 0usize;
    let mut outside_total = 0u32;
    for i in 0..history.topology.len() as u32 {
        let o = history.topology.outside_parents(i);
        if o > 0 {
            with_outside += 1;
            outside_total += o;
        }
    }
    println!("commits with outside parents: {with_outside}, edges: {outside_total}");
    println!(
        "commits: {}  refs: {} (in the graph {})  max_lane: {}  truncated: {}",
        history.nodes.len(),
        ref_count,
        history.rows.len(),
        layout.max_lane,
        history.truncated
    );
    println!("refs: {refs_ms:.1} ms   read: {read_ms:.1} ms   layout: {layout_ms:.1} ms");
    println!();

    let names: Vec<String> = history
        .nodes
        .iter()
        .filter_map(gitspy_repo::Node::commit)
        .map(|c| format!("{} {}", &c.hash[..7], truncate(&c.subject, 44)))
        .collect();

    let text = dump::render(&layout, &names);
    for line in text.lines().take(show) {
        println!("{line}");
    }
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        s.chars().take(n).collect::<String>() + "…"
    }
}
