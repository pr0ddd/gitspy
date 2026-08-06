use crate::state::{exec_error, on_reader, AppState};
use crate::views::{AiServerView, CommitDraftView, ErrorView};
use gitspy_ai::AiError;
use std::path::PathBuf;
use tauri::State;

fn ai_error(base_url: &str, error: AiError) -> ErrorView {
    let view = ErrorView::new(error.code()).param("url", base_url);
    let view = match &error {
        AiError::ModelMissing { model, .. } => view.param("model", model),
        _ => view,
    };
    view.detail(error.detail())
}

#[tauri::command]
pub async fn ai_detect_server(base_url: String) -> Result<AiServerView, ErrorView> {
    let server = gitspy_ai::detect_server(&base_url)
        .await
        .map_err(|e| ai_error(&base_url, e))?;
    if server.models.is_empty() {
        return Err(ErrorView::new("ai.noModels").param("url", &base_url));
    }
    Ok(AiServerView {
        provider: server.provider.id().to_string(),
        models: server.models,
    })
}

#[tauri::command]
pub async fn ai_generate_commit(
    repo: String,
    base_url: String,
    model: String,
    state: State<'_, AppState>,
) -> Result<CommitDraftView, ErrorView> {
    let git = state.git()?;
    let path = PathBuf::from(&repo);
    let diff = on_reader(move || git.staged_diff(&path).map_err(exec_error)).await?;
    if diff.trim().is_empty() {
        return Err(ErrorView::new("ai.nothingStaged"));
    }
    let draft = gitspy_ai::generate_commit(&base_url, &model, &diff)
        .await
        .map_err(|e| ai_error(&base_url, e))?;
    Ok(CommitDraftView {
        summary: draft.summary,
        description: draft.description,
    })
}
