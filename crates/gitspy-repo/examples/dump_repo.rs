//! Быстрая проверка на настоящем репозитории:
//!   cargo run -p gitspy-repo --example dump_repo -- <путь> [сколько_строк_показать]

use gitspy_core::{chunk, dump};
use std::time::Instant;

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().unwrap_or_else(|| ".".to_string());
    let show: usize = args.next().and_then(|s| s.parse().ok()).unwrap_or(20);

    let t0 = Instant::now();
    let history = match gitspy_repo::read(std::path::Path::new(&path), None) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("ошибка: {e}");
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
    println!("коммитов с внешними родителями: {with_outside}, рёбер: {outside_total}");
    println!(
        "коммитов: {}  refs: {}  max_lane: {}  truncated: {}",
        history.commits.len(),
        history.refs.len(),
        layout.max_lane,
        history.truncated
    );
    println!("чтение: {read_ms:.1} мс   раскладка: {layout_ms:.1} мс");
    println!();

    let names: Vec<String> = history
        .commits
        .iter()
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
