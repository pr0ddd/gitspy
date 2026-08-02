#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

use gitspy_core::chunk;
use gitspy_core::layout::{Layout, NodeKind, Segment};
use gitspy_repo::{History, RefKind};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;
use tauri::State;

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

#[derive(Default)]
struct AppState {
    repos: Mutex<HashMap<String, OpenRepo>>,
}

struct OpenRepo {
    path: PathBuf,
    history: History,
}

fn with_repo<T>(
    state: &State<'_, AppState>,
    repo: &str,
    f: impl FnOnce(&OpenRepo) -> T,
) -> Result<T, ErrorView> {
    let guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    let open = guard
        .get(repo)
        .ok_or_else(|| ErrorView::new("repo.notOpen").param("path", repo))?;
    Ok(f(open))
}

#[derive(Serialize)]
struct ErrorView {
    code: String,
    params: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

impl ErrorView {
    fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
            params: BTreeMap::new(),
            detail: None,
        }
    }

    fn param(mut self, key: &str, value: impl ToString) -> Self {
        self.params.insert(key.to_string(), value.to_string());
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

fn state_lock_failed() -> ErrorView {
    ErrorView::new("app.stateLock")
}

#[derive(Serialize)]
struct LayoutView {
    path: String,
    count: usize,
    max_lane: u16,
    head: Option<u32>,
    truncated: bool,
    read_ms: f64,
    layout_ms: f64,
    lanes: Vec<u16>,
    colours: Vec<u8>,
    kinds: Vec<u8>,
    seg_offsets: Vec<u32>,
    seg_kind: Vec<u8>,
    seg_from: Vec<u16>,
    seg_to: Vec<u16>,
    seg_colour: Vec<u8>,
    refs: Vec<RefView>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum RefKindView {
    LocalBranch,
    RemoteBranch,
    Tag,
    Stash,
}

#[derive(Serialize)]
struct RefView {
    name: String,
    kind: RefKindView,
    commit: u32,
    is_head: bool,
}

#[derive(Serialize)]
struct WorktreeView {
    name: String,
    path: String,
    branch: Option<String>,
    is_main: bool,
    is_locked: bool,
}

#[derive(Serialize)]
struct CommitView {
    index: u32,
    hash: String,
    author: String,
    email: String,
    time: i64,
    subject: String,
    body: String,
}

fn node_kind_code(kind: NodeKind) -> u8 {
    match kind {
        NodeKind::Normal => node_kind::NORMAL,
        NodeKind::Merge => node_kind::MERGE,
        NodeKind::Root => node_kind::ROOT,
        NodeKind::Open => node_kind::OPEN,
    }
}

fn ref_kind_view(kind: RefKind) -> RefKindView {
    match kind {
        RefKind::LocalBranch => RefKindView::LocalBranch,
        RefKind::RemoteBranch => RefKindView::RemoteBranch,
        RefKind::Tag => RefKindView::Tag,
        RefKind::Stash => RefKindView::Stash,
    }
}

fn build_layout_view(
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

#[tauri::command]
async fn open_repo(path: String, state: State<'_, AppState>) -> Result<LayoutView, ErrorView> {
    let repo_path = PathBuf::from(&path);

    let started_reading = Instant::now();
    let history = gitspy_repo::read(&repo_path, None)?;
    let read_ms = started_reading.elapsed().as_secs_f64() * 1000.0;

    let started_layout = Instant::now();
    let layout = chunk::layout(&history.topology);
    let layout_ms = started_layout.elapsed().as_secs_f64() * 1000.0;

    let view = build_layout_view(&path, &history, &layout, read_ms, layout_ms);

    let mut guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    guard.insert(
        path.clone(),
        OpenRepo {
            path: repo_path,
            history,
        },
    );

    Ok(view)
}

#[tauri::command]
fn close_repo(repo: String, state: State<'_, AppState>) -> Result<(), ErrorView> {
    let mut guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    guard.remove(&repo);
    Ok(())
}

#[tauri::command]
fn open_repos(state: State<'_, AppState>) -> Result<Vec<String>, ErrorView> {
    let guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    Ok(guard
        .values()
        .map(|r| r.path.display().to_string())
        .collect())
}

#[tauri::command]
fn commit_range(
    repo: String,
    start: u32,
    len: u32,
    state: State<'_, AppState>,
) -> Result<Vec<CommitView>, ErrorView> {
    with_repo(&state, &repo, |open| {
        let total = open.history.commits.len();
        let from = (start as usize).min(total);
        let to = (from + len as usize).min(total);

        open.history.commits[from..to]
            .iter()
            .enumerate()
            .map(|(offset, c)| CommitView {
                index: (from + offset) as u32,
                hash: c.hash.clone(),
                author: c.author.clone(),
                email: c.email.clone(),
                time: c.time,
                subject: c.subject.clone(),
                body: c.body.clone(),
            })
            .collect()
    })
}

#[tauri::command]
fn worktrees(repo: String) -> Result<Vec<WorktreeView>, ErrorView> {
    let found = gitspy_repo::worktrees(&PathBuf::from(&repo))?;
    Ok(found
        .into_iter()
        .map(|w| WorktreeView {
            name: w.name,
            path: w.path,
            branch: w.branch,
            is_main: w.is_main,
            is_locked: w.is_locked,
        })
        .collect())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_repo,
            close_repo,
            open_repos,
            commit_range,
            worktrees
        ])
        .run(tauri::generate_context!())
        .expect("приложение запускается")
}
