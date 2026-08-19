use crate::state::{exec_error, on_reader, with_repo, AppState};
use crate::views::{
    build_changed_files, build_window_view, sides_of, BlameSpanView, ChangedFileView, DiffSides,
    ErrorView, FileCommitView, FoundCommitView, WindowView,
};
use gitspy_core::chunk::{self};
use std::path::PathBuf;
use tauri::State;

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
pub fn found_commits(
    repo: String,
    indices: Vec<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<FoundCommitView>, ErrorView> {
    with_repo(&state, &repo, |open| {
        indices
            .iter()
            .filter_map(|at| {
                let meta = open.history.nodes.get(*at as usize)?.commit()?;
                Some(FoundCommitView {
                    index: *at,
                    hash: meta.hash.clone(),
                    subject: meta.subject.clone(),
                    author: meta.author.clone(),
                    time: meta.time,
                })
            })
            .collect()
    })
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
        build_window_view(
            from,
            &layout,
            &open.history.nodes[from..to],
            open.owners.get(from..to).unwrap_or(&[]),
        )
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
        Ok(sides_of(before, after))
    })
    .await
}

#[tauri::command]
pub async fn commit_file_hunks(
    repo: String,
    hash: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<String, ErrorView> {
    let git = state.git()?;
    let repo_path = PathBuf::from(&repo);
    on_reader(move || {
        git.commit_diff_unified(&repo_path, &hash, &path)
            .map_err(exec_error)
    })
    .await
}

#[tauri::command]
pub async fn file_history(
    repo: String,
    path: String,
    from: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<FileCommitView>, ErrorView> {
    let git = state.git()?;
    let repo_path = PathBuf::from(&repo);
    on_reader(move || {
        git.file_history(&repo_path, &path, from.as_deref())
            .map_err(exec_error)
            .map(|commits| {
                commits
                    .into_iter()
                    .map(|c| FileCommitView {
                        hash: c.hash,
                        author: c.author,
                        email: c.email,
                        time: c.time,
                        subject: c.subject,
                        status: c.status.to_string(),
                        path: c.path,
                        old_path: c.old_path,
                    })
                    .collect()
            })
    })
    .await
}

#[tauri::command]
pub async fn blame_file(
    repo: String,
    path: String,
    at: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<BlameSpanView>, ErrorView> {
    let git = state.git()?;
    let repo_path = PathBuf::from(&repo);
    on_reader(move || {
        git.blame_file(&repo_path, &path, at.as_deref())
            .map_err(exec_error)
            .map(|spans| {
                spans
                    .into_iter()
                    .map(|s| BlameSpanView {
                        hash: s.hash,
                        author: s.author,
                        time: s.time,
                        summary: s.summary,
                        start_line: s.start_line,
                        lines: s.lines,
                    })
                    .collect()
            })
    })
    .await
}
