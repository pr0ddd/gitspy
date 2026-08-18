use super::*;
use crate::paths::data_dir;
use crate::state::AppState;
use crate::views::ErrorView;
use gitspy_hosts::remote::matches_remote;
use gitspy_hosts::secrets::Secrets;
use storage::Connection;
use tauri::State;

pub struct OwnedCredential {
    pub url: String,
    pub username: &'static str,
    pub token: String,
}

pub fn credential_for(
    app: &tauri::AppHandle,
    remotes: &[(String, String)],
) -> Option<OwnedCredential> {
    let dir = data_dir(app).ok()?;
    for connection in storage::load_connections(&dir) {
        if matches_remote(remotes, &connection.base_url).is_none() {
            continue;
        }
        let token = storage::secrets(&dir).read(&connection.id).ok().flatten()?;
        let cred = host_for(&connection).ok()?.credential();
        return Some(OwnedCredential {
            url: cred.url,
            username: cred.username,
            token,
        });
    }
    None
}

pub(crate) async fn connected_target(
    app: &tauri::AppHandle,
    state: &State<'_, AppState>,
    repo: &str,
) -> Result<(Connection, String, String), ErrorView> {
    let git = state.git()?;
    let path = std::path::PathBuf::from(repo);
    let remotes = crate::state::on_reader(move || Ok(git.remote_urls(&path))).await?;

    let dir = data_dir(app)?;
    for connection in storage::load_connections(&dir) {
        if let Some((owner, name)) = matches_remote(&remotes, &connection.base_url) {
            return Ok((connection, owner, name));
        }
    }
    Err(ErrorView::new("host.noConnection"))
}
