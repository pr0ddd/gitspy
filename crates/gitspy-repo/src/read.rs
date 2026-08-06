use crate::model::{CommitMeta, Error, History, Node, RefSeed, WorkingTreeTip};
use gitspy_core::topology::{CommitIdx, Topology};
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct Geometry {
    pub topology: Topology,
    pub rows: HashMap<String, CommitIdx>,
    pub head: Option<CommitIdx>,
    pub truncated: bool,
}

pub fn read(
    path: &Path,
    max_commits: Option<usize>,
    seeds: &[RefSeed],
    head_oid: Option<&str>,
) -> Result<History, Error> {
    read_with_working_tree(path, max_commits, None, seeds, head_oid)
}

pub fn read_with_working_tree(
    path: &Path,
    max_commits: Option<usize>,
    tip: Option<WorkingTreeTip>,
    seeds: &[RefSeed],
    head_oid: Option<&str>,
) -> Result<History, Error> {
    let Some(prepared) = prepare(path, seeds, head_oid)? else {
        return Ok(empty_history());
    };
    let mut walked = walk(&prepared, max_commits, Metadata::Collect)?;
    let assembled = assemble(&prepared, &mut walked, tip.as_ref())?;

    let mut nodes: Vec<Node> = Vec::with_capacity(walked.commits.len() + 1);
    if let Some(tip) = &tip {
        nodes.push(Node::WorkingTree {
            added: tip.added,
            modified: tip.modified,
            deleted: tip.deleted,
            conflicts: tip.conflicts,
            in_progress: tip.in_progress.clone(),
        });
    }
    nodes.extend(walked.commits.drain(..).map(Node::Commit));

    Ok(History {
        topology: assembled.topology,
        nodes,
        rows: assembled.rows,
        head: assembled.head,
        truncated: walked.truncated,
    })
}

pub fn read_geometry(
    path: &Path,
    max_commits: Option<usize>,
    seeds: &[RefSeed],
    head_oid: Option<&str>,
) -> Result<Geometry, Error> {
    let Some(prepared) = prepare(path, seeds, head_oid)? else {
        let empty = empty_history();
        return Ok(Geometry {
            topology: empty.topology,
            rows: empty.rows,
            head: empty.head,
            truncated: empty.truncated,
        });
    };
    let mut walked = walk(&prepared, max_commits, Metadata::Skip)?;
    let assembled = assemble(&prepared, &mut walked, None)?;

    Ok(Geometry {
        topology: assembled.topology,
        rows: assembled.rows,
        head: assembled.head,
        truncated: walked.truncated,
    })
}

struct Prepared {
    repo: gix::Repository,
    seeds: Vec<gix::ObjectId>,
    head_oid: Option<gix::ObjectId>,
    hidden: HashSet<gix::ObjectId>,
    tips: Vec<gix::ObjectId>,
}

fn object_id(hex: &str) -> Option<gix::ObjectId> {
    gix::ObjectId::from_hex(hex.as_bytes()).ok()
}

fn present_commit(repo: &gix::Repository, oid: gix::ObjectId) -> bool {
    repo.find_header(oid)
        .map(|header| header.kind() == gix::object::Kind::Commit)
        .unwrap_or(false)
}

fn prepare(
    path: &Path,
    seeds: &[RefSeed],
    head_oid: Option<&str>,
) -> Result<Option<Prepared>, Error> {
    let repo = gix::open(path).map_err(|e| Error::OpenRepo {
        path: path.display().to_string(),
        detail: e.to_string(),
    })?;

    let parsed: Vec<(gix::ObjectId, bool)> = seeds
        .iter()
        .filter_map(|seed| object_id(&seed.oid).map(|oid| (oid, seed.is_stash)))
        .filter(|(oid, _)| present_commit(&repo, *oid))
        .collect();

    let stashes: Vec<gix::ObjectId> = parsed
        .iter()
        .filter(|(_, is_stash)| *is_stash)
        .map(|(oid, _)| *oid)
        .collect();
    let hidden = stash_snapshots(&repo, &stashes);

    let head_oid = head_oid.and_then(object_id);
    let seeds: Vec<gix::ObjectId> = parsed.into_iter().map(|(oid, _)| oid).collect();

    let mut tips = seeds.clone();
    tips.extend(head_oid);
    if tips.is_empty() {
        return Ok(None);
    }
    tips.sort();
    tips.dedup();

    Ok(Some(Prepared {
        repo,
        seeds,
        head_oid,
        hidden,
        tips,
    }))
}

struct Assembled {
    topology: Topology,
    rows: HashMap<String, CommitIdx>,
    head: Option<CommitIdx>,
}

fn assemble(
    prepared: &Prepared,
    walked: &mut Walked,
    tip: Option<&WorkingTreeTip>,
) -> Result<Assembled, Error> {
    let permutation = git_date_order(&walked.order, &walked.raw_parents, &walked.committer_times);
    apply_permutation(
        &permutation,
        &mut walked.order,
        &mut walked.raw_parents,
        &mut walked.commits,
    );

    let index: HashMap<gix::ObjectId, CommitIdx> = walked
        .order
        .iter()
        .enumerate()
        .map(|(i, oid)| (*oid, i as CommitIdx))
        .collect();

    let (parents, outside) = resolve_parents(&walked.raw_parents, &index, &prepared.hidden)?;
    let shift = if tip.is_some() { 1 } else { 0 };
    let (parents, outside) = match tip {
        None => (parents, outside),
        Some(tip) => {
            let mut shifted_parents: Vec<Vec<CommitIdx>> = Vec::with_capacity(parents.len() + 1);
            let mut shifted_outside: Vec<u32> = Vec::with_capacity(outside.len() + 1);

            let mut tip_parents: Vec<CommitIdx> = Vec::new();
            for hex in &tip.parents {
                let Ok(oid) = hex.parse::<gix::ObjectId>() else {
                    continue;
                };
                if let Some(&found) = index.get(&oid) {
                    let moved = found + 1;
                    if !tip_parents.contains(&moved) {
                        tip_parents.push(moved);
                    }
                }
            }
            shifted_parents.push(tip_parents);
            shifted_outside.push(0);

            for row in parents {
                shifted_parents.push(row.into_iter().map(|p| p + 1).collect());
            }
            shifted_outside.extend(outside);
            (shifted_parents, shifted_outside)
        }
    };

    let topology = Topology::new(parents, outside).map_err(|e| Error::WalkHistory {
        detail: format!("{e:?}"),
    })?;

    let rows = prepared
        .seeds
        .iter()
        .filter_map(|oid| index.get(oid).map(|&row| (oid.to_string(), row + shift)))
        .collect();

    let head = prepared
        .head_oid
        .and_then(|oid| index.get(&oid).copied())
        .map(|i| i + shift);

    Ok(Assembled {
        topology,
        rows,
        head,
    })
}

fn empty_history() -> History {
    History {
        topology: Topology::new(vec![], vec![]).expect("пустая топология корректна"),
        nodes: Vec::new(),
        rows: HashMap::new(),
        head: None,
        truncated: false,
    }
}

fn stash_snapshots(repo: &gix::Repository, entries: &[gix::ObjectId]) -> HashSet<gix::ObjectId> {
    let mut snapshots = HashSet::new();
    for &oid in entries {
        let Ok(object) = repo.find_object(oid) else {
            continue;
        };
        let Ok(commit) = object.try_into_commit() else {
            continue;
        };
        for parent in commit.parent_ids().skip(1) {
            snapshots.insert(parent.detach());
        }
    }
    snapshots
}

struct Walked {
    order: Vec<gix::ObjectId>,
    raw_parents: Vec<Vec<gix::ObjectId>>,
    commits: Vec<CommitMeta>,
    committer_times: Vec<i64>,
    truncated: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Metadata {
    Collect,
    Skip,
}

fn walk(
    prepared: &Prepared,
    max_commits: Option<usize>,
    metadata: Metadata,
) -> Result<Walked, Error> {
    let repo = &prepared.repo;
    let hidden = &prepared.hidden;
    let limit = max_commits.unwrap_or(usize::MAX);

    let walk = repo
        .rev_walk(prepared.tips.clone())
        .sorting(gix::revision::walk::Sorting::ByCommitTime(
            gix::traverse::commit::simple::CommitTimeOrder::NewestFirst,
        ))
        .all()
        .map_err(|e| Error::WalkHistory {
            detail: e.to_string(),
        })?;

    let mut walked = Walked {
        order: Vec::new(),
        raw_parents: Vec::new(),
        commits: Vec::new(),
        committer_times: Vec::new(),
        truncated: false,
    };

    for item in walk {
        if walked.order.len() >= limit {
            walked.truncated = true;
            break;
        }
        let info = item.map_err(|e| Error::WalkHistory {
            detail: e.to_string(),
        })?;
        let oid = info.id;
        if hidden.contains(&oid) {
            continue;
        }

        if metadata == Metadata::Skip {
            walked.committer_times.push(info.commit_time.unwrap_or(0));
            walked
                .raw_parents
                .push(info.parent_ids.into_iter().collect());
            walked.order.push(oid);
            continue;
        }

        let object = repo.find_object(oid).map_err(|e| Error::ReadObject {
            detail: e.to_string(),
        })?;
        let commit = object.try_into_commit().map_err(|e| Error::ReadObject {
            detail: e.to_string(),
        })?;
        let decoded = commit.decode().map_err(|e| Error::ReadObject {
            detail: e.to_string(),
        })?;

        let author = decoded.author().map_err(|e| Error::ReadObject {
            detail: e.to_string(),
        })?;
        let committer = decoded.committer().map_err(|e| Error::ReadObject {
            detail: e.to_string(),
        })?;
        let message = decoded.message();

        walked
            .committer_times
            .push(committer.time().map(|t| t.seconds).unwrap_or(0));
        walked.commits.push(CommitMeta {
            hash: oid.to_string(),
            author: author.name.to_string(),
            email: author.email.to_string(),
            time: author.time().map(|t| t.seconds).unwrap_or(0),
            committer: committer.name.to_string(),
            committer_email: committer.email.to_string(),
            committer_time: committer.time().map(|t| t.seconds).unwrap_or(0),
            subject: message.summary().to_string(),
            body: message
                .body()
                .map(|b| b.to_string())
                .unwrap_or_default()
                .trim()
                .to_string(),
        });
        walked.raw_parents.push(decoded.parents().collect());
        walked.order.push(oid);
    }

    Ok(walked)
}

fn resolve_parents(
    raw_parents: &[Vec<gix::ObjectId>],
    index: &HashMap<gix::ObjectId, CommitIdx>,
    hidden: &HashSet<gix::ObjectId>,
) -> Result<(Vec<Vec<CommitIdx>>, Vec<u32>), Error> {
    let mut parents = Vec::with_capacity(raw_parents.len());
    let mut outside = Vec::with_capacity(raw_parents.len());

    for (child, ids) in raw_parents.iter().enumerate() {
        let child = child as CommitIdx;
        let mut known: Vec<CommitIdx> = Vec::new();
        let mut beyond_loaded_history = 0u32;

        for id in ids {
            if hidden.contains(id) {
                continue;
            }
            match index.get(id) {
                None => beyond_loaded_history += 1,
                Some(&parent) if known.contains(&parent) => {}
                Some(&parent) if parent > child => known.push(parent),
                Some(&parent) => return Err(Error::ParentBeforeChild { parent, child }),
            }
        }

        parents.push(known);
        outside.push(beyond_loaded_history);
    }

    Ok((parents, outside))
}

fn git_date_order(
    order: &[gix::ObjectId],
    raw_parents: &[Vec<gix::ObjectId>],
    committer_times: &[i64],
) -> Vec<usize> {
    let n = order.len();
    let position: HashMap<gix::ObjectId, usize> =
        order.iter().enumerate().map(|(i, oid)| (*oid, i)).collect();

    let mut pending_children = vec![0usize; n];
    let mut distinct_parents: Vec<Vec<usize>> = Vec::with_capacity(n);
    for ids in raw_parents {
        let mut distinct: Vec<usize> = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(&parent) = position.get(id) {
                if !distinct.contains(&parent) {
                    distinct.push(parent);
                    pending_children[parent] += 1;
                }
            }
        }
        distinct_parents.push(distinct);
    }

    let mut ready: BinaryHeap<(i64, Reverse<usize>)> = (0..n)
        .filter(|&i| pending_children[i] == 0)
        .map(|i| (committer_times[i], Reverse(i)))
        .collect();

    let mut result = Vec::with_capacity(n);
    while let Some((_, Reverse(i))) = ready.pop() {
        result.push(i);
        for &parent in &distinct_parents[i] {
            pending_children[parent] -= 1;
            if pending_children[parent] == 0 {
                ready.push((committer_times[parent], Reverse(parent)));
            }
        }
    }

    if result.len() < n {
        let emitted: HashSet<usize> = result.iter().copied().collect();
        result.extend((0..n).filter(|i| !emitted.contains(i)));
    }

    result
}

fn apply_permutation(
    permutation: &[usize],
    order: &mut Vec<gix::ObjectId>,
    raw_parents: &mut Vec<Vec<gix::ObjectId>>,
    commits: &mut Vec<CommitMeta>,
) {
    let metadata_collected = !commits.is_empty();
    let mut new_order = Vec::with_capacity(order.len());
    let mut new_parents = Vec::with_capacity(raw_parents.len());
    let mut new_commits = Vec::with_capacity(commits.len());
    for &old in permutation {
        new_order.push(order[old]);
        new_parents.push(std::mem::take(&mut raw_parents[old]));
        if metadata_collected {
            new_commits.push(commits[old].clone());
        }
    }
    *order = new_order;
    *raw_parents = new_parents;
    *commits = new_commits;
}
