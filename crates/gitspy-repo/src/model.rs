use gitspy_core::topology::{CommitIdx, Topology};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitMeta {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub subject: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefSeed {
    pub oid: String,
    pub is_stash: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkingTreeTip {
    pub parents: Vec<String>,
    pub staged: u32,
    pub unstaged: u32,
    pub conflicts: u32,
    pub in_progress: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Node {
    WorkingTree {
        staged: u32,
        unstaged: u32,
        conflicts: u32,
        in_progress: Option<String>,
    },
    Commit(CommitMeta),
}

impl Node {
    pub fn commit(&self) -> Option<&CommitMeta> {
        match self {
            Node::Commit(meta) => Some(meta),
            Node::WorkingTree { .. } => None,
        }
    }

    pub fn matches(&self, query: &str) -> bool {
        let Some(meta) = self.commit() else {
            return false;
        };
        let needle = query.trim().to_lowercase();
        if needle.is_empty() {
            return false;
        }

        meta.subject.to_lowercase().contains(&needle)
            || meta.body.to_lowercase().contains(&needle)
            || meta.author.to_lowercase().contains(&needle)
            || meta.email.to_lowercase().contains(&needle)
            || meta.hash.to_lowercase().starts_with(&needle)
    }
}

#[derive(Debug, Clone)]
pub struct History {
    pub topology: Topology,
    pub nodes: Vec<Node>,
    pub rows: std::collections::HashMap<String, CommitIdx>,
    pub head: Option<CommitIdx>,
    pub truncated: bool,
}

impl History {
    pub fn refresh_tip(&mut self, fresh: Option<WorkingTreeTip>) -> bool {
        let had_a_node = matches!(self.nodes.first(), Some(Node::WorkingTree { .. }));
        if had_a_node != fresh.is_some() {
            return true;
        }

        if let (
            Some(tip),
            Some(Node::WorkingTree {
                staged,
                unstaged,
                conflicts,
                in_progress,
            }),
        ) = (fresh, self.nodes.first_mut())
        {
            *staged = tip.staged;
            *unstaged = tip.unstaged;
            *conflicts = tip.conflicts;
            *in_progress = tip.in_progress;
        }
        false
    }
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
