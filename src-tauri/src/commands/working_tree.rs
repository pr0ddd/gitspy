use crate::operations::{self, PathOperation};
use crate::state::{exec_error, on_reader, AppState};
use crate::views::{
    build_working_tree, sides_of, ConflictFileView, DiffSides, ErrorView, WorkingTreeView,
};
use gitspy_exec::{Cancel, Git};
use std::path::{Path, PathBuf};
use tauri::State;

pub(crate) fn read_working_tree(git: &Git, path: &Path) -> Result<WorkingTreeView, ErrorView> {
    let remotes = git.remotes(path);
    let heading = git.merge_heading(path);
    git.status(path)
        .map(|tree| build_working_tree(tree, remotes, heading))
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
        let _held = lane.lock().expect("the queue lane is not poisoned");
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
    amend: bool,
    state: State<'_, AppState>,
) -> Result<WorkingTreeView, ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let path = PathBuf::from(&repo);

    let tree = on_reader(move || {
        let _held = lane.lock().expect("the queue lane is not poisoned");
        let args = operations::commit_args(&message, amend);
        let borrowed: Vec<&str> = args.iter().map(String::as_str).collect();
        git.run(&path, &borrowed, &Cancel::new(), &mut |_| {})
            .map_err(exec_error)?;
        read_working_tree(&git, &path)
    })
    .await?;

    state.mark_stale(&repo);
    Ok(tree)
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
            .map(|(before, after)| sides_of(before, after))
            .map_err(exec_error)
    })
    .await
}

#[tauri::command]
pub async fn working_tree_hunks(
    repo: String,
    path: String,
    staged: bool,
    state: State<'_, AppState>,
) -> Result<String, ErrorView> {
    let git = state.git()?;
    let repo_path = PathBuf::from(&repo);
    on_reader(move || {
        git.diff_unified(&repo_path, &path, staged)
            .map_err(exec_error)
    })
    .await
}

#[tauri::command]
pub async fn apply_hunk(
    repo: String,
    patch: String,
    cached: bool,
    reverse: bool,
    state: State<'_, AppState>,
) -> Result<WorkingTreeView, ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let repo_path = PathBuf::from(&repo);

    on_reader(move || {
        let _held = lane.lock().expect("the queue lane is not poisoned");
        git.apply_patch(&repo_path, &patch, cached, reverse)
            .map_err(exec_error)?;
        read_working_tree(&git, &repo_path)
    })
    .await
}

#[tauri::command]
pub async fn write_file(
    repo: String,
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<WorkingTreeView, ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let repo_path = PathBuf::from(&repo);

    on_reader(move || {
        let _held = lane.lock().expect("the queue lane is not poisoned");
        git.write_file(&repo_path, &path, &content)
            .map_err(exec_error)?;
        read_working_tree(&git, &repo_path)
    })
    .await
}

#[tauri::command]
pub async fn conflict_file(
    repo: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<ConflictFileView, ErrorView> {
    let git = state.git()?;
    let repo_path = PathBuf::from(&repo);

    on_reader(move || {
        let sides = git.conflict_sides(&repo_path, &path).map_err(exec_error)?;
        let merged = git
            .conflict_merged(&repo_path, &path)
            .or_else(|_| std::fs::read_to_string(repo_path.join(&path)).map_err(|_| ()))
            .unwrap_or_default();
        Ok(ConflictFileView {
            base: sides.base,
            ours: sides.ours,
            theirs: sides.theirs,
            merged,
        })
    })
    .await
}

#[tauri::command]
pub async fn resolve_conflict(
    repo: String,
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<WorkingTreeView, ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let repo_path = PathBuf::from(&repo);

    on_reader(move || {
        let _held = lane.lock().expect("the queue lane is not poisoned");
        git.resolve_file(&repo_path, &path, &content)
            .map_err(exec_error)?;
        read_working_tree(&git, &repo_path)
    })
    .await
}
