use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let path = PathBuf::from(std::env::args().nth(1).expect("путь к репозиторию"));
    let repo = gix::open(&path).expect("репозиторий открывается");

    let started = Instant::now();
    let platform = repo
        .status(gix::progress::Discard)
        .expect("статус доступен");
    let iter = platform.into_iter(None).expect("обход статуса запускается");

    let mut tracked = 0usize;
    let mut untracked = 0usize;
    for item in iter {
        match item.expect("запись статуса читается") {
            gix::status::Item::IndexWorktree(_) => tracked += 1,
            gix::status::Item::TreeIndex(_) => untracked += 1,
        }
    }

    println!(
        "index↔worktree: {tracked}  tree↔index: {untracked}  за {:.1} мс",
        started.elapsed().as_secs_f64() * 1000.0
    );
}
