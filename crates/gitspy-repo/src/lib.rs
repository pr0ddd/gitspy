#![forbid(unsafe_code)]

use gitspy_core::topology::{CommitIdx, Topology};
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitMeta {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub subject: String,
    pub body: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefKind {
    LocalBranch,
    RemoteBranch,
    Tag,
    Stash,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefLabel {
    pub name: String,
    pub kind: RefKind,
    pub commit: CommitIdx,
    pub is_head: bool,
}

#[derive(Debug, Clone)]
pub struct History {
    pub topology: Topology,
    pub commits: Vec<CommitMeta>,
    pub refs: Vec<RefLabel>,
    pub head: Option<CommitIdx>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    OpenRepo { path: String, detail: String },
    WalkHistory { detail: String },
    ReadObject { detail: String },
    ParentBeforeChild { parent: CommitIdx, child: CommitIdx },
}

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Error::OpenRepo { .. } => "repo.open",
            Error::WalkHistory { .. } => "repo.walk",
            Error::ReadObject { .. } => "repo.readObject",
            Error::ParentBeforeChild { .. } => "repo.parentBeforeChild",
        }
    }

    pub fn detail(&self) -> Option<&str> {
        match self {
            Error::OpenRepo { detail, .. }
            | Error::WalkHistory { detail }
            | Error::ReadObject { detail } => Some(detail),
            Error::ParentBeforeChild { .. } => None,
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::OpenRepo { path, detail } => write!(f, "repo.open {path}: {detail}"),
            Error::WalkHistory { detail } => write!(f, "repo.walk: {detail}"),
            Error::ReadObject { detail } => write!(f, "repo.readObject: {detail}"),
            Error::ParentBeforeChild { parent, child } => {
                write!(f, "repo.parentBeforeChild: {parent} before {child}")
            }
        }
    }
}

impl std::error::Error for Error {}

#[derive(Debug, Clone)]
pub struct Geometry {
    pub topology: Topology,
    pub refs: Vec<RefLabel>,
    pub head: Option<CommitIdx>,
    pub truncated: bool,
}

pub fn read(path: &Path, max_commits: Option<usize>) -> Result<History, Error> {
    let Some(prepared) = prepare(path)? else {
        return Ok(empty_history());
    };
    let mut walked = walk(&prepared, max_commits, Metadata::Collect)?;
    let assembled = assemble(&prepared, &mut walked)?;

    Ok(History {
        topology: assembled.topology,
        commits: walked.commits,
        refs: assembled.refs,
        head: assembled.head,
        truncated: walked.truncated,
    })
}

pub fn read_geometry(path: &Path, max_commits: Option<usize>) -> Result<Geometry, Error> {
    let Some(prepared) = prepare(path)? else {
        let empty = empty_history();
        return Ok(Geometry {
            topology: empty.topology,
            refs: empty.refs,
            head: empty.head,
            truncated: empty.truncated,
        });
    };
    let mut walked = walk(&prepared, max_commits, Metadata::Skip)?;
    let assembled = assemble(&prepared, &mut walked)?;

    Ok(Geometry {
        topology: assembled.topology,
        refs: assembled.refs,
        head: assembled.head,
        truncated: walked.truncated,
    })
}

struct Prepared {
    repo: gix::Repository,
    ref_records: Vec<RefRecord>,
    head_ref_name: Option<String>,
    head_oid: Option<gix::ObjectId>,
    hidden: HashSet<gix::ObjectId>,
    tips: Vec<gix::ObjectId>,
}

fn prepare(path: &Path) -> Result<Option<Prepared>, Error> {
    let repo = gix::open(path).map_err(|e| Error::OpenRepo {
        path: path.display().to_string(),
        detail: e.to_string(),
    })?;

    let head_ref_name = checked_out_branch(&repo);
    let mut ref_records = branches_and_tags(&repo)?;

    let stash_entries = stash_entries(&repo);
    let hidden = stash_snapshots(&repo, &stash_entries);
    for (position, &oid) in stash_entries.iter().enumerate() {
        let name = format!("stash@{{{position}}}");
        ref_records.push(RefRecord {
            short_name: name.clone(),
            full_name: format!("refs/{name}"),
            kind: RefKind::Stash,
            oid,
        });
    }

    let head_oid = repo.head_id().ok().map(|id| id.detach());
    let mut tips: Vec<gix::ObjectId> = ref_records.iter().map(|r| r.oid).collect();
    tips.extend(head_oid);
    if tips.is_empty() {
        return Ok(None);
    }
    tips.sort();
    tips.dedup();

    Ok(Some(Prepared {
        repo,
        ref_records,
        head_ref_name,
        head_oid,
        hidden,
        tips,
    }))
}

struct Assembled {
    topology: Topology,
    refs: Vec<RefLabel>,
    head: Option<CommitIdx>,
}

fn assemble(prepared: &Prepared, walked: &mut Walked) -> Result<Assembled, Error> {
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
    let topology = Topology::new(parents, outside).map_err(|e| Error::WalkHistory {
        detail: format!("{e:?}"),
    })?;

    let refs = prepared
        .ref_records
        .iter()
        .filter_map(|record| {
            index.get(&record.oid).map(|&commit| RefLabel {
                name: record.short_name.clone(),
                kind: record.kind,
                commit,
                is_head: prepared.head_ref_name.as_deref() == Some(record.full_name.as_str()),
            })
        })
        .collect();

    let head = prepared.head_oid.and_then(|oid| index.get(&oid).copied());

    Ok(Assembled {
        topology,
        refs,
        head,
    })
}

struct RefRecord {
    short_name: String,
    full_name: String,
    kind: RefKind,
    oid: gix::ObjectId,
}

fn empty_history() -> History {
    History {
        topology: Topology::new(vec![], vec![]).expect("пустая топология корректна"),
        commits: Vec::new(),
        refs: Vec::new(),
        head: None,
        truncated: false,
    }
}

fn checked_out_branch(repo: &gix::Repository) -> Option<String> {
    repo.head_ref()
        .ok()
        .flatten()
        .map(|r| r.name().as_bstr().to_string())
}

fn branches_and_tags(repo: &gix::Repository) -> Result<Vec<RefRecord>, Error> {
    let platform = repo.references().map_err(|e| Error::WalkHistory {
        detail: e.to_string(),
    })?;
    let iter = platform.all().map_err(|e| Error::WalkHistory {
        detail: e.to_string(),
    })?;

    let mut records = Vec::new();
    for reference in iter.flatten() {
        let full_name = reference.name().as_bstr().to_string();
        let Some((short_name, kind)) = classify(&full_name) else {
            continue;
        };

        let mut reference = reference;
        let Ok(id) = reference.peel_to_id() else {
            continue;
        };
        let oid = id.detach();
        if !points_at_commit(repo, oid) {
            continue;
        }

        records.push(RefRecord {
            short_name,
            full_name,
            kind,
            oid,
        });
    }
    Ok(records)
}

fn classify(full_name: &str) -> Option<(String, RefKind)> {
    if let Some(rest) = full_name.strip_prefix("refs/heads/") {
        return Some((rest.to_string(), RefKind::LocalBranch));
    }
    if let Some(rest) = full_name.strip_prefix("refs/remotes/") {
        if rest.ends_with("/HEAD") {
            return None;
        }
        return Some((rest.to_string(), RefKind::RemoteBranch));
    }
    full_name
        .strip_prefix("refs/tags/")
        .map(|rest| (rest.to_string(), RefKind::Tag))
}

fn points_at_commit(repo: &gix::Repository, oid: gix::ObjectId) -> bool {
    repo.find_header(oid)
        .map(|header| header.kind() == gix::object::Kind::Commit)
        .unwrap_or(false)
}

fn stash_entries(repo: &gix::Repository) -> Vec<gix::ObjectId> {
    let Ok(Some(reference)) = repo.try_find_reference("refs/stash") else {
        return Vec::new();
    };
    let mut platform = reference.log_iter();
    let Ok(Some(lines)) = platform.all() else {
        return Vec::new();
    };

    let mut newest_last: Vec<gix::ObjectId> = lines.flatten().map(|line| line.new_oid()).collect();
    newest_last.reverse();
    newest_last
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
