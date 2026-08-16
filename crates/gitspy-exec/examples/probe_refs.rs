use gitspy_exec::refs;
use gitspy_exec::Git;
use std::path::PathBuf;
use std::process::Command;
use std::time::Instant;

fn main() {
    let path = PathBuf::from(std::env::args().nth(1).expect("repository path argument"));
    let git = Git::discover().expect("git found");

    let format = format!("--format={}", refs::FORMAT);
    let started = Instant::now();
    let raw = Command::new("git")
        .arg("-C")
        .arg(&path)
        .args(["for-each-ref", &format])
        .output()
        .expect("git ran");
    let bare_ms = started.elapsed().as_secs_f64() * 1000.0;
    let bytes = raw.stdout.len();
    let lines = raw.stdout.iter().filter(|b| **b == b'\n').count();

    let started = Instant::now();
    let parsed = refs::parse_for_each_ref(&String::from_utf8_lossy(&raw.stdout));
    let parse_ms = started.elapsed().as_secs_f64() * 1000.0;

    println!("lines {lines}, bytes {bytes}");
    println!("first git run at all       {bare_ms:6.1} ms");
    println!("parsing lines into structs {parse_ms:6.1} ms");

    let mut ours = Vec::new();
    for attempt in 1..=5 {
        let started = Instant::now();
        ours = git.refs(&path).expect("refs read");
        let ms = started.elapsed().as_secs_f64() * 1000.0;
        println!("Git::refs, attempt {attempt}       {ms:6.1} ms");
    }

    let started = Instant::now();
    let head = git.head_oid(&path);
    println!(
        "Git::head_oid              {:6.1} ms   HEAD {}",
        started.elapsed().as_secs_f64() * 1000.0,
        head.map(|h| h[..7].to_string()).unwrap_or_default()
    );

    let stashes = ours
        .iter()
        .filter(|r| r.kind == refs::RefKind::Stash)
        .count();
    println!("refs {}, of them stashes {stashes}", ours.len());
    assert_eq!(
        parsed.len() + stashes,
        ours.len(),
        "parsing a single for-each-ref plus the stashes must add up to what Git::refs returns"
    );
}
