use gitspy_core::layout::{Layout, NodeKind, Segment};
use gitspy_repo::{History, RefKind};
use serde::Serialize;
use std::collections::BTreeMap;

mod node_kind {
    pub const NORMAL: u8 = 0;
    pub const MERGE: u8 = 1;
    pub const ROOT: u8 = 2;
    pub const OPEN: u8 = 3;
}

mod segment_kind {
    pub const THROUGH: u8 = 0;
    pub const BRANCH: u8 = 1;
    pub const MERGE: u8 = 2;
}

#[derive(Serialize)]
pub struct ErrorView {
    pub code: String,
    pub params: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl ErrorView {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
            params: BTreeMap::new(),
            detail: None,
        }
    }

    pub fn param(mut self, key: &str, value: impl ToString) -> Self {
        self.params.insert(key.to_string(), value.to_string());
        self
    }

    pub fn detail(mut self, detail: impl ToString) -> Self {
        self.detail = Some(detail.to_string());
        self
    }
}

impl From<gitspy_repo::Error> for ErrorView {
    fn from(error: gitspy_repo::Error) -> Self {
        use gitspy_repo::Error::*;

        let view = ErrorView::new(error.code());
        let view = match &error {
            OpenRepo { path, .. } => view.param("path", path),
            ParentBeforeChild { parent, child } => {
                view.param("parent", parent).param("child", child)
            }
            WalkHistory { .. } | ReadObject { .. } => view,
        };

        Self {
            detail: error.detail().map(str::to_string),
            ..view
        }
    }
}

pub fn state_lock_failed() -> ErrorView {
    ErrorView::new("app.stateLock")
}

#[derive(Serialize)]
pub struct LayoutView {
    pub path: String,
    pub count: usize,
    pub max_lane: u16,
    pub head: Option<u32>,
    pub truncated: bool,
    pub read_ms: f64,
    pub layout_ms: f64,
    pub lanes: Vec<u16>,
    pub colours: Vec<u8>,
    pub kinds: Vec<u8>,
    pub seg_offsets: Vec<u32>,
    pub seg_kind: Vec<u8>,
    pub seg_from: Vec<u16>,
    pub seg_to: Vec<u16>,
    pub seg_colour: Vec<u8>,
    pub refs: Vec<RefView>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RefKindView {
    LocalBranch,
    RemoteBranch,
    Tag,
    Stash,
}

#[derive(Serialize)]
pub struct RefView {
    pub name: String,
    pub kind: RefKindView,
    pub commit: u32,
    pub is_head: bool,
}

#[derive(Serialize)]
pub struct WorktreeView {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
    pub is_locked: bool,
}

#[derive(Serialize)]
pub struct CommitView {
    pub index: u32,
    pub hash: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub subject: String,
    pub body: String,
}

pub fn node_kind_code(kind: NodeKind) -> u8 {
    match kind {
        NodeKind::Normal => node_kind::NORMAL,
        NodeKind::Merge => node_kind::MERGE,
        NodeKind::Root => node_kind::ROOT,
        NodeKind::Open => node_kind::OPEN,
    }
}

pub fn ref_kind_view(kind: RefKind) -> RefKindView {
    match kind {
        RefKind::LocalBranch => RefKindView::LocalBranch,
        RefKind::RemoteBranch => RefKindView::RemoteBranch,
        RefKind::Tag => RefKindView::Tag,
        RefKind::Stash => RefKindView::Stash,
    }
}

pub fn build_layout_view(
    path: &str,
    history: &History,
    layout: &Layout,
    read_ms: f64,
    layout_ms: f64,
) -> LayoutView {
    let count = layout.len();

    let mut seg_offsets = Vec::with_capacity(count + 1);
    let mut seg_kind = Vec::new();
    let mut seg_from = Vec::new();
    let mut seg_to = Vec::new();
    let mut seg_colour = Vec::new();

    seg_offsets.push(0u32);
    for segments in &layout.segments {
        for segment in segments {
            let (kind, from, to, colour) = match segment {
                Segment::Through { lane, colour } => (segment_kind::THROUGH, *lane, *lane, *colour),
                Segment::Branch { from, to, colour } => (segment_kind::BRANCH, *from, *to, *colour),
                Segment::Merge { from, to, colour } => (segment_kind::MERGE, *from, *to, *colour),
            };
            seg_kind.push(kind);
            seg_from.push(from);
            seg_to.push(to);
            seg_colour.push(colour);
        }
        seg_offsets.push(seg_kind.len() as u32);
    }

    LayoutView {
        path: path.to_string(),
        count,
        max_lane: layout.max_lane,
        head: history.head,
        truncated: history.truncated,
        read_ms,
        layout_ms,
        lanes: layout.rows.iter().map(|r| r.lane).collect(),
        colours: layout.rows.iter().map(|r| r.colour).collect(),
        kinds: layout.rows.iter().map(|r| node_kind_code(r.kind)).collect(),
        seg_offsets,
        seg_kind,
        seg_from,
        seg_to,
        seg_colour,
        refs: history
            .refs
            .iter()
            .map(|r| RefView {
                name: r.name.clone(),
                kind: ref_kind_view(r.kind),
                commit: r.commit,
                is_head: r.is_head,
            })
            .collect(),
    }
}
