#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

mod operations;
mod recent;
mod views;
mod watcher;

use gitspy_core::chunk::{self, Skeleton};
use gitspy_exec::{Cancel, Git};
use gitspy_repo::History;
use operations::{Operation, OperationOutcome, PathOperation, Progress, Queue};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;
use tauri::ipc::Channel;
use tauri::Emitter;
use tauri::{Manager, State};
use views::{
    build_changed_files, build_repo_view, build_window_view, build_working_tree, state_lock_failed,
    ChangedFileView, DiffSides, ErrorView, RepoView, WindowView, WorkingTreeView, WorktreeView,
    MINIMAP_BUCKETS,
};

#[derive(Default)]
struct AppState {
    repos: Mutex<HashMap<String, OpenRepo>>,
    queue: Queue,
    watchers: watcher::Watchers,
    git: Mutex<Option<Git>>,
}

impl AppState {
    fn git(&self) -> Result<Git, ErrorView> {
        let mut slot = self.git.lock().map_err(|_| state_lock_failed())?;
        if let Some(found) = slot.as_ref() {
            return Ok(found.clone());
        }
        let found = Git::discover().map_err(|e| ErrorView::new(e.code()))?;
        *slot = Some(found.clone());
        Ok(found)
    }
}

struct OpenRepo {
    path: PathBuf,
    history: History,
    skeleton: Skeleton,
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

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, ErrorView> {
    app.path()
        .app_data_dir()
        .map_err(|e| ErrorView::new("app.dataDir").detail(e.to_string()))
}

struct Opened {
    history: History,
    skeleton: Skeleton,
    minimap: Vec<u32>,
    read_ms: f64,
    layout_ms: f64,
}

fn open_on_a_blocking_thread(path: PathBuf) -> Result<Opened, ErrorView> {
    let started_reading = Instant::now();
    let history = gitspy_repo::read(&path, None)?;
    let read_ms = started_reading.elapsed().as_secs_f64() * 1000.0;

    let started_layout = Instant::now();
    let skeleton = chunk::skeleton(&history.topology, chunk::CHUNK);
    let minimap = chunk::minimap(&skeleton, MINIMAP_BUCKETS);
    let layout_ms = started_layout.elapsed().as_secs_f64() * 1000.0;

    Ok(Opened {
        history,
        skeleton,
        minimap,
        read_ms,
        layout_ms,
    })
}

#[tauri::command]
async fn open_repo(
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<RepoView, ErrorView> {
    let repo_path = PathBuf::from(&path);
    let opened = tauri::async_runtime::spawn_blocking(move || open_on_a_blocking_thread(repo_path))
        .await
        .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))??;

    let view = build_repo_view(
        &path,
        &opened.history,
        &opened.skeleton,
        opened.minimap,
        opened.read_ms,
        opened.layout_ms,
    );

    let mut guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    guard.insert(
        path.clone(),
        OpenRepo {
            path: PathBuf::from(&path),
            history: opened.history,
            skeleton: opened.skeleton,
        },
    );
    drop(guard);

    if let Ok(dir) = data_dir(&app) {
        recent::remember(&dir, &path);
    }

    let repo_dir = PathBuf::from(&path);
    let notify = app.clone();
    let watched = path.clone();
    state
        .watchers
        .watch(&path, &watcher::git_dir(&repo_dir), move || {
            let _ = notify.emit("repo:changed", &watched);
        });

    Ok(view)
}

#[tauri::command]
async fn run_operation(
    repo: String,
    operation: Operation,
    progress: Channel<Progress>,
    state: State<'_, AppState>,
) -> Result<OperationOutcome, ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let path = PathBuf::from(&repo);

    tauri::async_runtime::spawn_blocking(move || {
        let _held = lane.lock().expect("полоса очереди не отравлена");
        operations::run(&git, &path, operation, &Cancel::new(), &mut |event| {
            let _ = progress.send(event);
        })
        .map_err(|e| {
            let view = ErrorView::new(e.code());
            match e.detail() {
                Some(detail) => view.detail(detail),
                None => view,
            }
        })
    })
    .await
    .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))?
}

#[tauri::command]
fn graph_window(
    repo: String,
    start: u32,
    len: u32,
    state: State<'_, AppState>,
) -> Result<WindowView, ErrorView> {
    with_repo(&state, &repo, |open| {
        let total = open.skeleton.len();
        let from = (start as usize).min(total);
        let to = (from + len as usize).min(total);

        let layout = chunk::window(&open.history.topology, &open.skeleton, from, to - from);
        build_window_view(from, &layout, &open.history.commits[from..to])
    })
}

fn exec_error(e: gitspy_exec::Error) -> ErrorView {
    let view = ErrorView::new(e.code());
    match e.detail() {
        Some(detail) => view.detail(detail),
        None => view,
    }
}

#[tauri::command]
async fn commit_files(
    repo: String,
    commit: String,
    state: State<'_, AppState>,
) -> Result<Vec<ChangedFileView>, ErrorView> {
    let git = state.git()?;
    let path = PathBuf::from(&repo);

    tauri::async_runtime::spawn_blocking(move || {
        git.commit_files(&path, &commit)
            .map(build_changed_files)
            .map_err(exec_error)
    })
    .await
    .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))?
}

#[tauri::command]
async fn diff_sides(
    repo: String,
    commit: String,
    path: String,
    old_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<DiffSides, ErrorView> {
    let git = state.git()?;
    let repo_path = PathBuf::from(&repo);

    tauri::async_runtime::spawn_blocking(move || {
        let before_path = old_path.unwrap_or_else(|| path.clone());
        let before = git
            .file_at(&repo_path, &format!("{commit}^1"), &before_path)
            .map_err(exec_error)?;
        let after = git
            .file_at(&repo_path, &commit, &path)
            .map_err(exec_error)?;
        Ok(DiffSides { before, after })
    })
    .await
    .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))?
}

#[tauri::command]
async fn working_tree(
    repo: String,
    state: State<'_, AppState>,
) -> Result<WorkingTreeView, ErrorView> {
    let git = state.git()?;
    let path = PathBuf::from(&repo);

    tauri::async_runtime::spawn_blocking(move || {
        git.status(&path)
            .map(build_working_tree)
            .map_err(exec_error)
    })
    .await
    .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))?
}

#[tauri::command]
async fn stage(
    repo: String,
    operation: PathOperation,
    state: State<'_, AppState>,
) -> Result<WorkingTreeView, ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let path = PathBuf::from(&repo);

    tauri::async_runtime::spawn_blocking(move || {
        let _held = lane.lock().expect("полоса очереди не отравлена");
        let args: Vec<String> = operation.args();
        let borrowed: Vec<&str> = args.iter().map(String::as_str).collect();

        git.run(&path, &borrowed, &Cancel::new(), &mut |_| {})
            .map_err(exec_error)?;
        git.status(&path)
            .map(build_working_tree)
            .map_err(exec_error)
    })
    .await
    .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))?
}

#[tauri::command]
fn recent_repos(app: tauri::AppHandle) -> Result<Vec<recent::RecentRepo>, ErrorView> {
    Ok(recent::list(&data_dir(&app)?))
}

#[tauri::command]
fn forget_repo(path: String, app: tauri::AppHandle) -> Result<Vec<recent::RecentRepo>, ErrorView> {
    Ok(recent::forget(&data_dir(&app)?, &path))
}

#[tauri::command]
fn close_repo(repo: String, state: State<'_, AppState>) -> Result<(), ErrorView> {
    let mut guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    guard.remove(&repo);
    drop(guard);
    state.watchers.forget(&repo);
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
            graph_window,
            worktrees,
            recent_repos,
            forget_repo,
            run_operation,
            commit_files,
            diff_sides,
            working_tree,
            stage
        ])
        .run(tauri::generate_context!())
        .expect("приложение запускается")
}
