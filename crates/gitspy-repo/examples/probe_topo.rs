use std::time::Instant;

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| ".".into());
    let repo = gix::open(std::path::Path::new(&path)).expect("репозиторий открывается");

    let mut tips: Vec<gix::ObjectId> = Vec::new();
    let platform = repo.references().expect("refs");
    for r in platform.all().expect("all").flatten() {
        let mut r = r;
        if let Ok(id) = r.peel_to_id() {
            tips.push(id.detach());
        }
    }
    tips.sort();
    tips.dedup();

    let t = Instant::now();
    let walk = repo
        .rev_walk(tips.clone())
        .sorting(gix::revision::walk::Sorting::ByCommitTime(
            gix::traverse::commit::simple::CommitTimeOrder::NewestFirst,
        ))
        .all()
        .expect("walk");
    let mut n = 0usize;
    let mut edges = 0usize;
    for item in walk {
        let info = item.expect("info");
        edges += info.parent_ids.len();
        n += 1;
    }
    println!(
        "топология:  {n} коммитов, {edges} рёбер — {:.1} мс",
        t.elapsed().as_secs_f64() * 1000.0
    );

    let t = Instant::now();
    let walk = repo
        .rev_walk(tips)
        .sorting(gix::revision::walk::Sorting::ByCommitTime(
            gix::traverse::commit::simple::CommitTimeOrder::NewestFirst,
        ))
        .all()
        .expect("walk");
    let mut bytes = 0usize;
    for item in walk {
        let info = item.expect("info");
        let obj = repo.find_object(info.id).expect("object");
        let commit = obj.try_into_commit().expect("commit");
        let d = commit.decode().expect("decode");
        bytes += d.message.len();
    }
    println!(
        "+ метаданные: {:.1} мс, сообщений {:.1} МБ",
        t.elapsed().as_secs_f64() * 1000.0,
        bytes as f64 / 1048576.0
    );
}
