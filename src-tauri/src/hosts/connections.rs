use super::*;
use crate::paths::data_dir;
use crate::views::{ConnectionView, ErrorView};
use gitspy_hosts::host::HostKind;
use gitspy_hosts::secrets::Secrets;
use gitspy_hosts::{gitlab, relay};
use storage::Connection;
use tauri::State;

pub(crate) fn connection_of(app: &tauri::AppHandle, host: &str) -> Option<Connection> {
    let dir = data_dir(app).ok()?;
    storage::load_connections(&dir)
        .into_iter()
        .find(|connection| connection.id == host)
}

pub(crate) fn remember_connection(app: &tauri::AppHandle, fresh: Connection) {
    let Ok(dir) = data_dir(app) else { return };
    let mut all = storage::load_connections(&dir);
    all.retain(|c| c.id != fresh.id);
    all.push(fresh);
    storage::save_connections(&dir, &all);
}

pub(crate) fn forget_connection(app: &tauri::AppHandle, host: &str) {
    let Ok(dir) = data_dir(app) else { return };
    let mut all = storage::load_connections(&dir);
    all.retain(|c| c.id != host);
    storage::save_connections(&dir, &all);
}

pub fn token(app: &tauri::AppHandle, host: &str) -> Option<String> {
    let dir = data_dir(app).ok()?;
    storage::read_tokens(&dir, host).map(|set| set.access)
}

pub(crate) const EXPIRY_MARGIN_SECONDS: i64 = 60;

pub fn access_is_stale(expires_at: Option<i64>, refreshable: bool, now: i64) -> bool {
    expires_at
        .map(|at| at - EXPIRY_MARGIN_SECONDS <= now)
        .unwrap_or(refreshable)
}

pub(crate) async fn renewed_tokens(
    app: &tauri::AppHandle,
    host: &str,
    refresh: &str,
) -> Option<relay::TokenSet> {
    let connection = connection_of(app, host)?;
    match connection.kind {
        HostKind::GitLab => gitlab::GitLab::new(&connection.base_url)
            .ok()?
            .refresh(refresh)
            .await
            .ok(),
        HostKind::GitHub | HostKind::Bitbucket => relay::refresh(host, refresh).await.ok(),
    }
}

pub async fn fresh_access(app: &tauri::AppHandle, host: &str) -> Option<String> {
    let dir = data_dir(app).ok()?;
    let set = storage::read_tokens(&dir, host)?;
    if !access_is_stale(set.expires_at, set.refresh.is_some(), now_unix()) {
        return Some(set.access);
    }
    let refresh = set.refresh.clone()?;
    let renewed = renewed_tokens(app, host, &refresh).await?;
    let mut stored = stored_tokens_of(&renewed);
    if stored.refresh.is_none() {
        stored.refresh = Some(refresh);
    }
    storage::save_tokens(&dir, host, &stored).ok()?;
    Some(stored.access)
}

pub(crate) fn remembered(app: &tauri::AppHandle, host: &str) -> storage::Known {
    match data_dir(app) {
        Ok(dir) => storage::read(&dir, host),
        Err(_) => storage::Known::default(),
    }
}

pub(crate) fn remember(app: &tauri::AppHandle, host: &str, known: &storage::Known) {
    if let Ok(dir) = data_dir(app) {
        storage::save(&dir, host, known);
    }
}

pub(crate) fn stored_tokens_of(set: &relay::TokenSet) -> storage::StoredTokens {
    storage::StoredTokens {
        access: set.access.clone(),
        refresh: set.refresh.clone(),
        expires_at: set
            .expires_in
            .map(|lives| now_unix() + lives.saturating_sub(60) as i64),
    }
}

pub(crate) fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn connections(app: tauri::AppHandle) -> Result<Vec<ConnectionView>, ErrorView> {
    let dir = data_dir(&app)?;
    Ok(storage::load_connections(&dir)
        .into_iter()
        .map(|c| ConnectionView {
            id: c.id,
            kind: match c.kind {
                HostKind::GitHub => "github".to_string(),
                HostKind::GitLab => "gitlab".to_string(),
                HostKind::Bitbucket => "bitbucket".to_string(),
            },
            base_url: c.base_url,
            login: c.login,
        })
        .collect())
}

#[tauri::command]
pub fn disconnect_host(
    host: String,
    app: tauri::AppHandle,
    hosts: State<'_, Hosts>,
) -> Result<(), ErrorView> {
    let dir = data_dir(&app)?;
    storage::secrets(&dir).forget(&host).map_err(host_error)?;
    storage::forget(&dir, &host);
    forget_connection(&app, &host);
    crate::avatars::wipe(&dir);
    hosts.drop_everything(&host);
    Ok(())
}
