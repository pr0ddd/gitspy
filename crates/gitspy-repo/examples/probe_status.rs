use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let path = PathBuf::from(std::env::args().nth(1).expect("path to the repository"));
    let repo = gix::open(&path).expect("repository opens");

    let started = Instant::now();
    let platform = repo
        .status(gix::progress::Discard)
        .expect("status is available");
    let iter = platform.into_iter(None).expect("status walk starts");

    let mut tracked = 0usize;
    let mut untracked = 0usize;
    for item in iter {
        match item.expect("status entry reads") {
            gix::status::Item::IndexWorktree(_) => tracked += 1,
            gix::status::Item::TreeIndex(_) => untracked += 1,
        }
    }

    println!(
        "index↔worktree: {tracked}  tree↔index: {untracked}  in {:.1} ms",
        started.elapsed().as_secs_f64() * 1000.0
    );
}
