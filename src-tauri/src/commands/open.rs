use crate::paths::data_dir;
use crate::recent;
use crate::state::{exec_error, on_reader, with_repo, AppState, OpenRepo};
use crate::views::{
    build_repo_view, owner_rows, state_lock_failed, ErrorView, RepoPassportView, RepoView, Timings,
    TipView, WorktreeView, MINIMAP_BUCKETS,
};
use crate::watcher;
use gitspy_core::chunk::{self, Skeleton};
use gitspy_exec::Git;
use gitspy_repo::History;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{Emitter, Manager, State};

pub(crate) struct Opened {
    history: History,
    refs: Vec<gitspy_exec::refs::RefLine>,
    remotes: Vec<crate::views::RemoteView>,
    skeleton: Skeleton,
    minimap: Vec<u32>,
    timings: Timings,
}

pub(crate) fn head_oid_of(
    git: &Git,
    path: &Path,
    refs: &[gitspy_exec::refs::RefLine],
) -> Option<String> {
    refs.iter()
        .find(|r| r.is_head)
        .map(|r| r.oid.clone())
        .or_else(|| git.head_oid(path))
}

pub(crate) fn seeds_of(refs: &[gitspy_exec::refs::RefLine]) -> Vec<gitspy_repo::RefSeed> {
    refs.iter()
        .map(|r| gitspy_repo::RefSeed {
            oid: r.oid.clone(),
            is_stash: r.kind == gitspy_exec::refs::RefKind::Stash,
        })
        .collect()
}

pub(crate) fn working_tree_tip(git: &Git, path: &Path) -> Option<gitspy_repo::WorkingTreeTip> {
    let tree = git.status(path).ok()?;
    if !tree.needs_a_row() {
        return None;
    }

    let parents: Vec<String> = tree
        .head
        .iter()
        .chain(tree.extra_parents.iter())
        .cloned()
        .collect();

    let counts = tree.change_counts();
    Some(gitspy_repo::WorkingTreeTip {
        parents,
        added: counts.added,
        modified: counts.modified,
        deleted: counts.deleted,
        conflicts: counts.conflicts,
        in_progress: tree.in_progress.map(|p| p.code().to_string()),
    })
}

pub(crate) fn open_on_a_blocking_thread(path: PathBuf, git: Git) -> Result<Opened, ErrorView> {
    let tip = working_tree_tip(&git, &path);

    let started_reading = Instant::now();
    let refs = git.refs(&path).map_err(exec_error)?;
    let head_oid = head_oid_of(&git, &path, &refs);
    let history = gitspy_repo::read_with_working_tree(
        &path,
        None,
        tip,
        &seeds_of(&refs),
        head_oid.as_deref(),
    )?;
    let read_ms = started_reading.elapsed().as_secs_f64() * 1000.0;

    let started_layout = Instant::now();
    let skeleton = chunk::skeleton(&history.topology, chunk::CHUNK);
    let minimap = chunk::minimap(&skeleton, MINIMAP_BUCKETS);
    let layout_ms = started_layout.elapsed().as_secs_f64() * 1000.0;

    Ok(Opened {
        history,
        refs,
        remotes: crate::views::build_remote_views(git.remote_urls(&path)),
        skeleton,
        minimap,
        timings: Timings { read_ms, layout_ms },
    })
}

#[tauri::command]
pub async fn open_repo(
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<RepoView, ErrorView> {
    let repo_path = PathBuf::from(&path);

    if !state.needs_reading(&path) {
        if let Ok(ready) = with_repo(&state, &path, |open| open.view.clone()) {
            return Ok(ready);
        }
    }

    let git = state.git()?;
    let opened = on_reader(move || open_on_a_blocking_thread(repo_path, git)).await?;

    let view = build_repo_view(
        &path,
        &opened.history,
        &opened.refs,
        opened.remotes.clone(),
        &opened.skeleton,
        opened.minimap,
        opened.timings,
    );

    let owners = owner_rows(&opened.history, &opened.refs);
    let mut guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    guard.insert(
        path.clone(),
        OpenRepo {
            path: PathBuf::from(&path),
            history: opened.history,
            skeleton: opened.skeleton,
            owners,
            view: view.clone(),
        },
    );
    drop(guard);
    state.remember_read(&path);

    if let Ok(dir) = data_dir(&app) {
        recent::remember(&dir, &path);
    }

    let repo_dir = PathBuf::from(&path);
    let notify = app.clone();
    let watched = path.clone();
    state.watchers.watch(&repo_dir, move |change| {
        if change == watcher::Change::Git {
            if let Some(state) = notify.try_state::<AppState>() {
                state.mark_stale(&watched);
            }
        }
        let _ = notify.emit(change.event(), &watched);
    });

    Ok(view)
}

#[tauri::command]
pub fn close_repo(repo: String, state: State<'_, AppState>) -> Result<(), ErrorView> {
    let mut guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    guard.remove(&repo);
    drop(guard);
    state.watchers.forget(&repo);
    Ok(())
}

#[tauri::command]
pub fn open_repos(state: State<'_, AppState>) -> Result<Vec<String>, ErrorView> {
    let guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    Ok(guard
        .values()
        .map(|r| r.path.display().to_string())
        .collect())
}

#[tauri::command]
pub async fn refresh_tip(repo: String, state: State<'_, AppState>) -> Result<TipView, ErrorView> {
    let git = state.git()?;
    let path = PathBuf::from(&repo);

    let fresh = on_reader(move || Ok(working_tree_tip(&git, &path))).await?;

    Ok(TipView {
        structure_changed: state.refresh_tip(&repo, fresh)?,
    })
}

#[tauri::command]
pub async fn repository_root(
    path: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, ErrorView> {
    let git = state.git()?;
    let dropped = PathBuf::from(path);
    on_reader(move || {
        git.toplevel(&dropped)
            .map(|root| root.map(|p| p.to_string_lossy().into_owned()))
            .map_err(exec_error)
    })
    .await
}

#[tauri::command]
pub async fn repo_passports(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<RepoPassportView>, ErrorView> {
    let git = state.git()?;
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .map(|path| {
                let at = Path::new(&path);
                let branch = git.head_branch(at).ok().flatten();
                let host = git
                    .origin_url(at)
                    .ok()
                    .flatten()
                    .and_then(|url| gitspy_hosts::remote::host_of_url(&url));
                RepoPassportView { path, branch, host }
            })
            .collect()
    })
    .await
    .map_err(|_| state_lock_failed())
}

#[tauri::command]
pub fn favorite_repo(
    path: String,
    on: bool,
    app: tauri::AppHandle,
) -> Result<Vec<recent::RecentRepo>, ErrorView> {
    Ok(recent::favorite(&data_dir(&app)?, &path, on))
}

#[tauri::command]
pub fn recent_repos(app: tauri::AppHandle) -> Result<Vec<recent::RecentRepo>, ErrorView> {
    Ok(recent::list(&data_dir(&app)?))
}

#[tauri::command]
pub fn forget_repo(
    path: String,
    app: tauri::AppHandle,
) -> Result<Vec<recent::RecentRepo>, ErrorView> {
    Ok(recent::forget(&data_dir(&app)?, &path))
}

#[tauri::command]
pub fn worktrees(repo: String) -> Result<Vec<WorktreeView>, ErrorView> {
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
