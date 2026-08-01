#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

use gitspy_core::chunk;
use gitspy_core::layout::{Layout, NodeKind, Segment};
use gitspy_repo::{History, RefKind};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;
use tauri::State;

/// Открытый репозиторий живёт в состоянии приложения: метаданные коммитов
/// не уезжают во фронтенд целиком, а выдаются окнами по запросу.
#[derive(Default)]
struct AppState {
    open: Mutex<Option<OpenRepo>>,
}

struct OpenRepo {
    path: PathBuf,
    history: History,
    layout: Layout,
}

/// Раскладка целиком, но без строк: только числа, чтобы замерять граф,
/// а не сериализацию сообщений коммитов.
#[derive(Serialize)]
struct LayoutView {
    path: String,
    count: usize,
    max_lane: u16,
    head: Option<u32>,
    truncated: bool,
    read_ms: f64,
    layout_ms: f64,
    /// Дорожка каждого коммита.
    lanes: Vec<u16>,
    /// Цвет каждого коммита (индекс палитры).
    colours: Vec<u8>,
    /// 0 Normal, 1 Merge, 2 Root, 3 Open.
    kinds: Vec<u8>,
    /// Границы сегментов по строкам: сегменты строки i лежат в [off[i], off[i+1]).
    seg_offsets: Vec<u32>,
    /// 0 through, 1 branch, 2 merge.
    seg_kind: Vec<u8>,
    seg_from: Vec<u16>,
    seg_to: Vec<u16>,
    seg_colour: Vec<u8>,
    refs: Vec<RefView>,
}

#[derive(Serialize)]
struct RefView {
    name: String,
    /// 0 local, 1 remote, 2 tag.
    kind: u8,
    commit: u32,
    is_head: bool,
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

fn kind_code(kind: NodeKind) -> u8 {
    match kind {
        NodeKind::Normal => 0,
        NodeKind::Merge => 1,
        NodeKind::Root => 2,
        NodeKind::Open => 3,
    }
}

fn build_layout_view(path: &str, history: &History, layout: &Layout, read_ms: f64, layout_ms: f64) -> LayoutView {
    let count = layout.len();

    let mut seg_offsets = Vec::with_capacity(count + 1);
    let mut seg_kind = Vec::new();
    let mut seg_from = Vec::new();
    let mut seg_to = Vec::new();
    let mut seg_colour = Vec::new();

    seg_offsets.push(0u32);
    for segments in &layout.segments {
        for segment in segments {
            match segment {
                Segment::Through { lane, colour } => {
                    seg_kind.push(0);
                    seg_from.push(*lane);
                    seg_to.push(*lane);
                    seg_colour.push(*colour);
                }
                Segment::Branch { from, to, colour } => {
                    seg_kind.push(1);
                    seg_from.push(*from);
                    seg_to.push(*to);
                    seg_colour.push(*colour);
                }
                Segment::Merge { from, to, colour } => {
                    seg_kind.push(2);
                    seg_from.push(*from);
                    seg_to.push(*to);
                    seg_colour.push(*colour);
                }
            }
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
        kinds: layout.rows.iter().map(|r| kind_code(r.kind)).collect(),
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
                kind: match r.kind {
                    RefKind::LocalBranch => 0,
                    RefKind::RemoteBranch => 1,
                    RefKind::Tag => 2,
                },
                commit: r.commit,
                is_head: r.is_head,
            })
            .collect(),
    }
}

#[tauri::command]
async fn open_repo(path: String, state: State<'_, AppState>) -> Result<LayoutView, String> {
    let pb = PathBuf::from(&path);

    let t0 = Instant::now();
    let history = gitspy_repo::read(&pb, None).map_err(|e| e.to_string())?;
    let read_ms = t0.elapsed().as_secs_f64() * 1000.0;

    let t1 = Instant::now();
    let layout = chunk::layout(&history.topology);
    let layout_ms = t1.elapsed().as_secs_f64() * 1000.0;

    let view = build_layout_view(&path, &history, &layout, read_ms, layout_ms);

    let mut guard = state.open.lock().map_err(|e| e.to_string())?;
    *guard = Some(OpenRepo { path: pb, history, layout });

    Ok(view)
}

/// Метаданные для окна строк. Именно так фронтенд их и получает — по мере скролла.
#[tauri::command]
fn commit_range(start: u32, len: u32, state: State<'_, AppState>) -> Result<Vec<CommitView>, String> {
    let guard = state.open.lock().map_err(|e| e.to_string())?;
    let repo = guard.as_ref().ok_or("репозиторий не открыт")?;

    let total = repo.history.commits.len();
    let from = (start as usize).min(total);
    let to = (from + len as usize).min(total);

    Ok(repo.history.commits[from..to]
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
        .collect())
}

#[tauri::command]
fn current_path(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let guard = state.open.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|r| r.path.display().to_string()))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![open_repo, commit_range, current_path])
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
