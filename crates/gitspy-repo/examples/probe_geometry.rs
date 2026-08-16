use gitspy_core::chunk;
use gitspy_exec::Git;
use gitspy_repo::RefSeed;
use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let path = PathBuf::from(std::env::args().nth(1).expect("path to the repository"));
    let with_metadata = std::env::args().nth(2).as_deref() == Some("full");

    let git = Git::discover().expect("git found on the system");
    let head = git.head_oid(&path);
    let seeds: Vec<RefSeed> = git
        .refs(&path)
        .expect("refs read")
        .into_iter()
        .map(|r| RefSeed {
            is_stash: r.kind == gitspy_exec::refs::RefKind::Stash,
            oid: r.oid,
        })
        .collect();

    let started = Instant::now();
    let geometry =
        gitspy_repo::read_geometry(&path, None, &seeds, head.as_deref()).expect("geometry reads");
    let read_ms = started.elapsed().as_secs_f64() * 1000.0;

    let started = Instant::now();
    let skeleton = chunk::skeleton(&geometry.topology, chunk::CHUNK);
    let layout_ms = started.elapsed().as_secs_f64() * 1000.0;

    let started = Instant::now();
    let window = chunk::window(&geometry.topology, &skeleton, 0, 60);
    let window_ms = started.elapsed().as_secs_f64() * 1000.0;

    let outside: u32 = (0..geometry.topology.len() as u32)
        .map(|i| geometry.topology.outside_parents(i))
        .sum();

    println!(
        "commits {}  refs {}  lanes {}  outside parents {}",
        geometry.topology.len(),
        geometry.rows.len(),
        skeleton.max_lane as usize + 1,
        outside
    );
    println!(
        "geometry {read_ms:.0} ms   skeleton {layout_ms:.0} ms   window {window_ms:.2} ms   total {:.0} ms",
        read_ms + layout_ms
    );
    let _ = window.len();

    if with_metadata {
        let started = Instant::now();
        let history = gitspy_repo::read(&path, None, &seeds, head.as_deref()).expect("full read");
        println!(
            "full read with metadata {:.0} ms, commits {}",
            started.elapsed().as_secs_f64() * 1000.0,
            history.nodes.len()
        );
    }
}
