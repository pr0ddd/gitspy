use crate::hosts;
use crate::operations::{self, Operation, OperationOutcome, PathOperation, Progress};
use crate::paths::data_dir;
use crate::recent;
use crate::state::{exec_error, on_reader, with_repo, AppState, OpenRepo};
use crate::views::{
    build_changed_files, build_repo_view, build_window_view, build_working_tree, state_lock_failed,
    ChangedFileView, DiffSides, ErrorView, RepoView, TipView, WindowView, WorkingTreeView,
    WorktreeView, MINIMAP_BUCKETS,
};
use crate::watcher;
use gitspy_core::chunk::{self, Skeleton};
use gitspy_exec::{Cancel, Git};
use gitspy_repo::History;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::ipc::Channel;
use tauri::{Emitter, Manager, State};

struct Opened {
    history: History,
    refs: Vec<gitspy_exec::refs::RefLine>,
    skeleton: Skeleton,
    minimap: Vec<u32>,
    read_ms: f64,
    layout_ms: f64,
}

fn head_oid_of(git: &Git, path: &Path, refs: &[gitspy_exec::refs::RefLine]) -> Option<String> {
    refs.iter()
        .find(|r| r.is_head)
        .map(|r| r.oid.clone())
        .or_else(|| git.head_oid(path))
}

fn seeds_of(refs: &[gitspy_exec::refs::RefLine]) -> Vec<gitspy_repo::RefSeed> {
    refs.iter()
        .map(|r| gitspy_repo::RefSeed {
            oid: r.oid.clone(),
            is_stash: r.kind == gitspy_exec::refs::RefKind::Stash,
        })
        .collect()
}

fn working_tree_tip(git: &Git, path: &Path) -> Option<gitspy_repo::WorkingTreeTip> {
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

    Some(gitspy_repo::WorkingTreeTip {
        parents,
        staged: tree.staged() as u32,
        unstaged: tree.unstaged() as u32,
        conflicts: tree.conflicts() as u32,
        in_progress: tree.in_progress.map(|p| p.code().to_string()),
    })
}

fn open_on_a_blocking_thread(path: PathBuf, git: Git) -> Result<Opened, ErrorView> {
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
        skeleton,
        minimap,
        read_ms,
        layout_ms,
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
pub fn search_commits(
    repo: String,
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<u32>, ErrorView> {
    with_repo(&state, &repo, |open| {
        open.history
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, node)| node.matches(&query))
            .map(|(at, _)| at as u32)
            .collect()
    })
}

#[tauri::command]
pub async fn refresh_tip(repo: String, state: State<'_, AppState>) -> Result<TipView, ErrorView> {
    let git = state.git()?;
    let path = PathBuf::from(&repo);

    let fresh = on_reader(move || Ok(working_tree_tip(&git, &path))).await?;

    let mut guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    let open = guard
        .get_mut(&repo)
        .ok_or_else(|| ErrorView::new("repo.notOpen").param("path", &repo))?;

    Ok(TipView {
        structure_changed: open.history.refresh_tip(fresh),
    })
}

#[tauri::command]
pub async fn run_operation(
    repo: String,
    operation: Operation,
    progress: Channel<Progress>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<OperationOutcome, ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let path = PathBuf::from(&repo);

    let token = operation
        .reaches_the_network()
        .then(|| hosts::token(&app, gitspy_hosts::github::ID))
        .flatten();

    on_reader(move || {
        let _held = lane.lock().expect("полоса очереди не отравлена");
        let credential = token.as_deref().map(|token| gitspy_exec::Credential {
            url: hosts::GITHUB_URL,
            token,
        });

        operations::run(
            &git,
            &path,
            operation,
            credential,
            &Cancel::new(),
            &mut |event| {
                let _ = progress.send(event);
            },
        )
        .map_err(exec_error)
    })
    .await
}

#[tauri::command]
pub fn graph_window(
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
        build_window_view(from, &layout, &open.history.nodes[from..to])
    })
}

#[tauri::command]
pub async fn commit_files(
    repo: String,
    commit: String,
    state: State<'_, AppState>,
) -> Result<Vec<ChangedFileView>, ErrorView> {
    let git = state.git()?;
    let path = PathBuf::from(&repo);

    on_reader(move || {
        git.commit_files(&path, &commit)
            .map(build_changed_files)
            .map_err(exec_error)
    })
    .await
}

#[tauri::command]
pub async fn diff_sides(
    repo: String,
    commit: String,
    path: String,
    old_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<DiffSides, ErrorView> {
    let git = state.git()?;
    let repo_path = PathBuf::from(&repo);

    on_reader(move || {
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
}

fn read_working_tree(git: &Git, path: &Path) -> Result<WorkingTreeView, ErrorView> {
    let remotes = git.remotes(path);
    git.status(path)
        .map(|tree| build_working_tree(tree, remotes))
        .map_err(exec_error)
}

#[tauri::command]
pub async fn working_tree(
    repo: String,
    state: State<'_, AppState>,
) -> Result<WorkingTreeView, ErrorView> {
    let git = state.git()?;
    let path = PathBuf::from(&repo);

    on_reader(move || read_working_tree(&git, &path)).await
}

#[tauri::command]
pub async fn stage(
    repo: String,
    operation: PathOperation,
    state: State<'_, AppState>,
) -> Result<WorkingTreeView, ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let path = PathBuf::from(&repo);

    on_reader(move || {
        let _held = lane.lock().expect("полоса очереди не отравлена");
        let args: Vec<String> = operation.args();
        let borrowed: Vec<&str> = args.iter().map(String::as_str).collect();

        git.run(&path, &borrowed, &Cancel::new(), &mut |_| {})
            .map_err(exec_error)?;
        read_working_tree(&git, &path)
    })
    .await
}

#[tauri::command]
pub async fn commit(
    repo: String,
    message: String,
    state: State<'_, AppState>,
) -> Result<WorkingTreeView, ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let path = PathBuf::from(&repo);

    on_reader(move || {
        let _held = lane.lock().expect("полоса очереди не отравлена");
        git.run(
            &path,
            &["commit", "-m", &message],
            &Cancel::new(),
            &mut |_| {},
        )
        .map_err(exec_error)?;
        read_working_tree(&git, &path)
    })
    .await
}

#[tauri::command]
pub async fn working_tree_diff(
    repo: String,
    path: String,
    staged: bool,
    state: State<'_, AppState>,
) -> Result<DiffSides, ErrorView> {
    let git = state.git()?;
    let repo_path = PathBuf::from(&repo);

    on_reader(move || {
        git.working_tree_sides(&repo_path, &path, staged)
            .map(|(before, after)| DiffSides { before, after })
            .map_err(exec_error)
    })
    .await
}

#[tauri::command]
pub async fn checkout_pull(
    repo: String,
    number: u32,
    branch: String,
    from_fork: bool,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let path = PathBuf::from(&repo);
    let token = hosts::token(&app, gitspy_hosts::github::ID);

    on_reader(move || {
        let _held = lane.lock().expect("полоса очереди не отравлена");
        let credential = token.as_deref().map(|token| gitspy_exec::Credential {
            url: hosts::GITHUB_URL,
            token,
        });

        for step in operations::checkout_pull_commands(number, &branch, from_fork) {
            let borrowed: Vec<&str> = step.iter().map(String::as_str).collect();
            git.run_as(&path, &borrowed, credential, &Cancel::new(), &mut |_| {})
                .map_err(exec_error)?;
        }
        Ok(())
    })
    .await
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
