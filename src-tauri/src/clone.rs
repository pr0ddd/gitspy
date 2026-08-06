use crate::hosts;
use crate::state::{exec_error, AppState};
use crate::views::{build_clone_step, CloneStepView, ErrorView};
use gitspy_exec::Cancel;
use std::path::PathBuf;
use tauri::ipc::Channel;
use tauri::{Manager, State};

fn token_for(app: &tauri::AppHandle) -> Option<String> {
    hosts::token(app, gitspy_hosts::github::ID)
}

#[tauri::command]
pub fn default_clone_dir(app: tauri::AppHandle) -> Result<String, ErrorView> {
    let parent = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| ErrorView::new("clone.noDirectory").detail(e.to_string()))?;
    Ok(parent.join("gitspy").display().to_string())
}

#[tauri::command]
pub async fn clone_repo(
    url: String,
    parent: String,
    name: String,
    progress: Channel<CloneStepView>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, ErrorView> {
    let git = state.git()?;
    let into = PathBuf::from(&parent).join(name.trim());

    if into.exists() {
        return Err(ErrorView::new("clone.exists").param("path", into.display()));
    }

    let token = token_for(&app);
    let destination = into.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let credential = token.as_deref().map(|token| gitspy_exec::Credential {
            url: hosts::GITHUB_URL,
            token,
        });

        git.clone_into(
            &url,
            &destination,
            credential,
            &Cancel::new(),
            &mut |step| {
                let _ = progress.send(build_clone_step(step));
            },
        )
        .map_err(exec_error)
    })
    .await
    .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))??;

    Ok(into.display().to_string())
}

#[tauri::command]
pub async fn init_repo(
    path: String,
    branch: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, ErrorView> {
    let git = state.git()?;
    let at = PathBuf::from(&path);

    if at.join(".git").exists() {
        return Err(ErrorView::new("init.taken").param("path", &path));
    }

    tauri::async_runtime::spawn_blocking(move || git.init(&at, branch.as_deref()).map_err(exec_error))
        .await
        .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))??;

    Ok(path)
}
