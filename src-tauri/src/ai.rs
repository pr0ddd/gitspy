use crate::state::{exec_error, on_reader, AppState};
use crate::views::{CommitDraftView, ErrorView};
use gitspy_ai::{AiError, AiProvider};
use std::path::PathBuf;
use tauri::State;

fn provider_of(id: &str) -> Result<AiProvider, ErrorView> {
    AiProvider::from_id(id)
        .ok_or_else(|| ErrorView::new("ai.unknownProvider").param("provider", id))
}

fn ai_error(base_url: &str, error: AiError) -> ErrorView {
    ErrorView::new(error.code())
        .param("url", base_url)
        .detail(error.detail())
}

#[tauri::command]
pub async fn ai_list_models(provider: String, base_url: String) -> Result<Vec<String>, ErrorView> {
    let provider = provider_of(&provider)?;
    gitspy_ai::list_models(provider, &base_url)
        .await
        .map_err(|e| ai_error(&base_url, e))
}

#[tauri::command]
pub async fn ai_generate_commit(
    repo: String,
    provider: String,
    base_url: String,
    model: String,
    state: State<'_, AppState>,
) -> Result<CommitDraftView, ErrorView> {
    let provider = provider_of(&provider)?;
    let git = state.git()?;
    let path = PathBuf::from(&repo);
    let diff = on_reader(move || git.staged_diff(&path).map_err(exec_error)).await?;
    if diff.trim().is_empty() {
        return Err(ErrorView::new("ai.nothingStaged"));
    }
    let draft = gitspy_ai::generate_commit(provider, &base_url, &model, &diff)
        .await
        .map_err(|e| ai_error(&base_url, e))?;
    Ok(CommitDraftView {
        summary: draft.summary,
        description: draft.description,
    })
}
