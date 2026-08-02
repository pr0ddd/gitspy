#![forbid(unsafe_code)]

//! Чтение репозитория через gix: топология, метаданные коммитов, refs.
//!
//! Раскладкой занимается `gitspy-core`; здесь только добыча данных с диска.

use gitspy_core::topology::{CommitIdx, Topology};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitMeta {
    pub hash: String,
    pub author: String,
    pub email: String,
    /// Секунды с эпохи, время автора.
    pub time: i64,
    pub subject: String,
    pub body: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefKind {
    LocalBranch,
    RemoteBranch,
    Tag,
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
    /// Индекс коммита, на котором стоит HEAD.
    pub head: Option<CommitIdx>,
    /// Обход упёрся в предел, история загружена не целиком.
    pub truncated: bool,
}

#[derive(Debug)]
pub enum Error {
    Open(String),
    Walk(String),
    Read(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Open(m) => write!(f, "не удалось открыть репозиторий: {m}"),
            Error::Walk(m) => write!(f, "не удалось обойти историю: {m}"),
            Error::Read(m) => write!(f, "не удалось прочитать объект: {m}"),
        }
    }
}

impl std::error::Error for Error {}

/// Читает историю репозитория целиком либо до предела `max_commits`.
pub fn read(path: &Path, max_commits: Option<usize>) -> Result<History, Error> {
    let repo = gix::open(path).map_err(|e| Error::Open(e.to_string()))?;

    // Вершины обхода — все локальные и удалённые ветки, теги и HEAD.
    let mut tips: Vec<gix::ObjectId> = Vec::new();
    // Полное имя ссылки хранится рядом с коротким: по нему определяется
    // текущая ветка. Сравнивать по oid нельзя — две ветки на одном коммите
    // обе получили бы отметку «вы здесь».
    let mut ref_records: Vec<(String, String, RefKind, gix::ObjectId)> = Vec::new();

    // Имя ссылки, на которую смотрит HEAD. При detached HEAD его нет вовсе.
    let head_ref_name: Option<String> = repo
        .head_ref()
        .ok()
        .flatten()
        .map(|r| r.name().as_bstr().to_string());

    let platform = repo.references().map_err(|e| Error::Walk(e.to_string()))?;
    let iter = platform.all().map_err(|e| Error::Walk(e.to_string()))?;
    for reference in iter.flatten() {
        let full_name = reference.name().as_bstr().to_string();
        let classified = if let Some(rest) = full_name.strip_prefix("refs/heads/") {
            Some((rest.to_string(), RefKind::LocalBranch))
        } else if let Some(rest) = full_name.strip_prefix("refs/remotes/") {
            if rest.ends_with("/HEAD") {
                None
            } else {
                Some((rest.to_string(), RefKind::RemoteBranch))
            }
        } else {
            full_name
                .strip_prefix("refs/tags/")
                .map(|rest| (rest.to_string(), RefKind::Tag))
        };
        let Some((short, kind)) = classified else {
            continue;
        };

        let mut reference = reference;
        let Ok(id) = reference.peel_to_id() else {
            continue;
        };
        let oid = id.detach();

        // Тег может указывать не на коммит, а на дерево или blob: peel_to_id
        // разворачивает лишь цепочку тегов и останавливается на первом не-теге.
        // Такой oid в вершинах обхода роняет чтение ВСЕГО репозитория.
        // git log --all подобные ссылки молча пропускает — делаем так же.
        let is_commit = repo
            .find_header(oid)
            .map(|h| h.kind() == gix::object::Kind::Commit)
            .unwrap_or(false);
        if !is_commit {
            continue;
        }

        tips.push(oid);
        ref_records.push((short, full_name, kind, oid));
    }

    let head_oid = repo.head_id().ok().map(|id| id.detach());
    if let Some(oid) = head_oid {
        tips.push(oid);
    }

    if tips.is_empty() {
        return Ok(History {
            topology: Topology::new(vec![], vec![]).expect("пустая топология корректна"),
            commits: Vec::new(),
            refs: Vec::new(),
            head: None,
            truncated: false,
        });
    }

    tips.sort();
    tips.dedup();

    let walk = repo
        .rev_walk(tips)
        .sorting(gix::revision::walk::Sorting::ByCommitTime(
            gix::traverse::commit::simple::CommitTimeOrder::NewestFirst,
        ))
        .all()
        .map_err(|e| Error::Walk(e.to_string()))?;

    let limit = max_commits.unwrap_or(usize::MAX);
    let mut order: Vec<gix::ObjectId> = Vec::new();
    let mut raw_parents: Vec<Vec<gix::ObjectId>> = Vec::new();
    let mut commits: Vec<CommitMeta> = Vec::new();
    let mut truncated = false;

    for item in walk {
        if order.len() >= limit {
            truncated = true;
            break;
        }
        let info = item.map_err(|e| Error::Walk(e.to_string()))?;
        let oid = info.id;

        let object = repo
            .find_object(oid)
            .map_err(|e| Error::Read(e.to_string()))?;
        let commit = object
            .try_into_commit()
            .map_err(|e| Error::Read(e.to_string()))?;
        let decoded = commit.decode().map_err(|e| Error::Read(e.to_string()))?;

        let author = decoded.author().map_err(|e| Error::Read(e.to_string()))?;
        let message = decoded.message();

        commits.push(CommitMeta {
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

        raw_parents.push(decoded.parents().collect());
        order.push(oid);
    }

    // Индексы по хешу — только для загруженного окна.
    let index: HashMap<gix::ObjectId, CommitIdx> = order
        .iter()
        .enumerate()
        .map(|(i, oid)| (*oid, i as CommitIdx))
        .collect();

    let mut parents: Vec<Vec<CommitIdx>> = Vec::with_capacity(order.len());
    let mut outside: Vec<u32> = Vec::with_capacity(order.len());
    for (i, ps) in raw_parents.iter().enumerate() {
        let mut known = Vec::new();
        let mut outside_count = 0u32;
        for p in ps {
            match index.get(p) {
                // Родитель обязан идти ПОСЛЕ потомка. Если обход выдал иной
                // порядок, считаем родителя внешним — лучше нарисовать обрыв,
                // чем построить некорректную топологию.
                Some(&idx) if idx as usize > i && !known.contains(&idx) => known.push(idx),
                _ => outside_count += 1,
            }
        }
        parents.push(known);
        outside.push(outside_count);
    }

    let topology = Topology::new(parents, outside).map_err(|e| Error::Walk(format!("{e:?}")))?;

    let refs: Vec<RefLabel> = ref_records
        .into_iter()
        .filter_map(|(name, full_name, kind, oid)| {
            index.get(&oid).map(|&commit| RefLabel {
                name,
                kind,
                commit,
                // Только та ссылка, на которую смотрит HEAD. При detached HEAD
                // текущей ветки нет, и отмечать нечего.
                is_head: head_ref_name.as_deref() == Some(full_name.as_str()),
            })
        })
        .collect();

    let head = head_oid.and_then(|oid| index.get(&oid).copied());

    Ok(History { topology, commits, refs, head, truncated })
}
