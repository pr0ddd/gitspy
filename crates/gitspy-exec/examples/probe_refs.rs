use gitspy_exec::refs;
use gitspy_exec::Git;
use std::path::PathBuf;
use std::process::Command;
use std::time::Instant;

fn main() {
    let path = PathBuf::from(std::env::args().nth(1).expect("путь к репозиторию"));
    let git = Git::discover().expect("git найден");

    let format = format!("--format={}", refs::FORMAT);
    let started = Instant::now();
    let raw = Command::new("git")
        .arg("-C")
        .arg(&path)
        .args(["for-each-ref", &format])
        .output()
        .expect("git отработал");
    let bare_ms = started.elapsed().as_secs_f64() * 1000.0;
    let bytes = raw.stdout.len();
    let lines = raw.stdout.iter().filter(|b| **b == b'\n').count();

    let started = Instant::now();
    let parsed = refs::parse_for_each_ref(&String::from_utf8_lossy(&raw.stdout));
    let parse_ms = started.elapsed().as_secs_f64() * 1000.0;

    println!("строк {lines}, байт {bytes}");
    println!("первый запуск git вообще   {bare_ms:6.1} мс");
    println!("разбор строки в структуры  {parse_ms:6.1} мс");

    let mut ours = Vec::new();
    for attempt in 1..=5 {
        let started = Instant::now();
        ours = git.refs(&path).expect("ссылки читаются");
        let ms = started.elapsed().as_secs_f64() * 1000.0;
        println!("Git::refs, попытка {attempt}       {ms:6.1} мс");
    }

    let started = Instant::now();
    let head = git.head_oid(&path);
    println!(
        "Git::head_oid              {:6.1} мс   HEAD {}",
        started.elapsed().as_secs_f64() * 1000.0,
        head.map(|h| h[..7].to_string()).unwrap_or_default()
    );

    let stashes = ours
        .iter()
        .filter(|r| r.kind == refs::RefKind::Stash)
        .count();
    println!("ссылок {} из них стешей {stashes}", ours.len());
    assert_eq!(
        parsed.len() + stashes,
        ours.len(),
        "разбор одного for-each-ref плюс стеши обязаны сойтись с тем, что отдаёт Git::refs"
    );
}
