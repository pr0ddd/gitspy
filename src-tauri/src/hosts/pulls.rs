use super::*;
use crate::paths::data_dir;
use crate::state::AppState;
use crate::views::build_pull_view;
use crate::views::{ErrorView, PullCardView, PullCommentView, PullListView};
use tauri::State;

pub(crate) fn my_login(app: &tauri::AppHandle, hosts: &State<'_, Hosts>, host: &str) -> String {
    hosts
        .known_account(host)
        .or_else(|| remembered(app, host).account)
        .map(|account| account.login)
        .unwrap_or_default()
}

#[tauri::command]
pub async fn pull_requests(
    repo: String,
    refresh: bool,
    network: bool,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    hosts: State<'_, Hosts>,
) -> Result<Option<PullListView>, ErrorView> {
    let (connection, owner, name) = match connected_target(&app, &state, &repo).await {
        Ok(found) => found,
        Err(error) if !network => {
            let _ = error;
            return Ok(None);
        }
        Err(error) => return Err(error),
    };
    let login = my_login(&app, &hosts, &connection.id);
    let dir = data_dir(&app)?;

    if !refresh {
        if let Some(known) = storage::read_pulls(&dir, &connection.id, &owner, &name) {
            return Ok(Some(PullListView {
                pulls: known
                    .pulls
                    .iter()
                    .map(|pull| build_pull_view(pull, &login))
                    .collect(),
                truncated: known.truncated,
                fetched_at: known.fetched_at,
            }));
        }
    }

    if !network {
        return Ok(None);
    }

    let token = fresh_access(&app, &connection.id)
        .await
        .ok_or_else(|| host_error(gitspy_hosts::Error::NoToken))?;
    let client = host_for(&connection)?;
    let (pulls, truncated) = client
        .pulls(&token, &owner, &name)
        .await
        .map_err(host_error)?;

    let fetched_at = now_unix();
    storage::save_pulls(
        &dir,
        &connection.id,
        &owner,
        &name,
        &storage::KnownPulls {
            pulls: pulls.clone(),
            truncated,
            fetched_at,
        },
    );

    Ok(Some(PullListView {
        pulls: pulls
            .iter()
            .map(|pull| build_pull_view(pull, &login))
            .collect(),
        truncated,
        fetched_at,
    }))
}

pub(crate) fn pull_error(e: gitspy_hosts::Error) -> ErrorView {
    match e {
        gitspy_hosts::Error::Unexpected { status: 404, .. } => ErrorView::new("pull.gone"),
        other => host_error(other),
    }
}

#[tauri::command]
pub async fn pull_card(
    repo: String,
    number: u32,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    hosts: State<'_, Hosts>,
) -> Result<PullCardView, ErrorView> {
    let (connection, owner, name) = connected_target(&app, &state, &repo).await?;
    let login = my_login(&app, &hosts, &connection.id);
    let token = fresh_access(&app, &connection.id)
        .await
        .ok_or_else(|| host_error(gitspy_hosts::Error::NoToken))?;
    let client = host_for(&connection)?;

    let detail = client
        .pull_detail(&token, &owner, &name, number as u64)
        .await
        .map_err(pull_error)?;
    let comments = client
        .pull_comments(&token, &owner, &name, number as u64)
        .await
        .map_err(pull_error)?;

    Ok(PullCardView {
        pull: build_pull_view(&detail.summary, &login),
        body: detail.body,
        labels: detail.labels,
        changed_files: detail.changed_files as u32,
        additions: detail.additions as u32,
        deletions: detail.deletions as u32,
        comments: comments
            .into_iter()
            .map(|comment| PullCommentView {
                author: comment.author,
                author_avatar_url: comment.author_avatar_url,
                body: comment.body,
                created_at: comment.created_at,
            })
            .collect(),
    })
}
