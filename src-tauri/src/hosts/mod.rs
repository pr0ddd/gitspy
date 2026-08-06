pub mod loopback;
pub mod storage;

use crate::paths::data_dir;
use crate::state::AppState;
use crate::views::{build_account, build_pull_view, build_repo_listing};
use crate::views::{
    AccountView, ConnectStartView, ConnectionView, ErrorView, PullCardView, PullCommentView,
    PullListView, RepoListingView,
};
use gitspy_hosts::github::{self, Repo};
use gitspy_hosts::host::{Host, HostKind};
use gitspy_hosts::remote::matches_remote;
use gitspy_hosts::secrets::Secrets;
use gitspy_hosts::{bitbucket, gitlab, pkce, relay, Account};
use std::collections::HashMap;
use std::sync::Mutex;
use storage::Connection;
use tauri::{Emitter, Manager, State};

const REPO_PAGES: u32 = 10;

pub const CONNECTED_EVENT: &str = "host:connected";
pub const FAILED_EVENT: &str = "host:failed";

#[derive(Default)]
pub struct Hosts {
    accounts: Mutex<HashMap<String, Account>>,
    listings: Mutex<HashMap<String, Vec<Repo>>>,
    browsing: Mutex<HashMap<String, String>>,
}

impl Hosts {
    pub fn stop_waiting(&self, host: &str) {
        if let Ok(mut browsing) = self.browsing.lock() {
            browsing.remove(host);
        }
    }

    fn already_browsing(&self, host: &str) -> Option<String> {
        self.browsing.lock().ok()?.get(host).cloned()
    }

    fn browse_for(&self, host: &str, url: String) {
        if let Ok(mut browsing) = self.browsing.lock() {
            browsing.insert(host.to_string(), url);
        }
    }

    pub(crate) fn known_account(&self, host: &str) -> Option<Account> {
        self.accounts.lock().ok()?.get(host).cloned()
    }

    fn keep_account(&self, host: &str, account: Account) {
        if let Ok(mut known) = self.accounts.lock() {
            known.insert(host.to_string(), account);
        }
    }

    fn known_repos(&self, host: &str) -> Option<Vec<Repo>> {
        self.listings.lock().ok()?.get(host).cloned()
    }

    fn keep_repos(&self, host: &str, repos: Vec<Repo>) {
        if let Ok(mut known) = self.listings.lock() {
            known.insert(host.to_string(), repos);
        }
    }

    fn drop_everything(&self, host: &str) {
        if let Ok(mut known) = self.accounts.lock() {
            known.remove(host);
        }
        if let Ok(mut known) = self.listings.lock() {
            known.remove(host);
        }
        self.stop_waiting(host);
    }
}

pub fn host_error(e: gitspy_hosts::Error) -> ErrorView {
    let view = ErrorView::new(e.code());
    match e.detail() {
        Some(detail) => view.detail(detail),
        None => view,
    }
}

fn known_def(host: &str) -> Result<(HostKind, &'static str), ErrorView> {
    match host {
        "github" => Ok((HostKind::GitHub, "https://github.com")),
        "gitlab" => Ok((HostKind::GitLab, "https://gitlab.com")),
        "bitbucket" => Ok((HostKind::Bitbucket, bitbucket::BASE_URL)),
        other => Err(ErrorView::new("host.unknown").param("host", other)),
    }
}

fn host_for(connection: &Connection) -> Result<Host, ErrorView> {
    Host::for_connection(connection.kind, &connection.base_url).map_err(host_error)
}

fn connection_of(app: &tauri::AppHandle, host: &str) -> Option<Connection> {
    let dir = data_dir(app).ok()?;
    storage::load_connections(&dir)
        .into_iter()
        .find(|connection| connection.id == host)
}

fn remember_connection(app: &tauri::AppHandle, fresh: Connection) {
    let Ok(dir) = data_dir(app) else { return };
    let mut all = storage::load_connections(&dir);
    all.retain(|c| c.id != fresh.id);
    all.push(fresh);
    storage::save_connections(&dir, &all);
}

fn forget_connection(app: &tauri::AppHandle, host: &str) {
    let Ok(dir) = data_dir(app) else { return };
    let mut all = storage::load_connections(&dir);
    all.retain(|c| c.id != host);
    storage::save_connections(&dir, &all);
}

pub fn token(app: &tauri::AppHandle, host: &str) -> Option<String> {
    let dir = data_dir(app).ok()?;
    storage::read_tokens(&dir, host).map(|set| set.access)
}

pub async fn fresh_access(app: &tauri::AppHandle, host: &str) -> Option<String> {
    let dir = data_dir(app).ok()?;
    let set = storage::read_tokens(&dir, host)?;
    let stale = set.expires_at.map(|at| at <= now_unix()).unwrap_or(false);
    if !stale {
        return Some(set.access);
    }
    let refresh = set.refresh.clone()?;
    let renewed = relay::refresh(host, &refresh).await.ok()?;
    let mut stored = stored_tokens_of(&renewed);
    if stored.refresh.is_none() {
        stored.refresh = Some(refresh);
    }
    storage::save_tokens(&dir, host, &stored).ok()?;
    Some(stored.access)
}

fn remembered(app: &tauri::AppHandle, host: &str) -> storage::Known {
    match data_dir(app) {
        Ok(dir) => storage::read(&dir, host),
        Err(_) => storage::Known::default(),
    }
}

fn remember(app: &tauri::AppHandle, host: &str, known: &storage::Known) {
    if let Ok(dir) = data_dir(app) {
        storage::save(&dir, host, known);
    }
}

fn stored_tokens_of(set: &relay::TokenSet) -> storage::StoredTokens {
    storage::StoredTokens {
        access: set.access.clone(),
        refresh: set.refresh.clone(),
        expires_at: set
            .expires_in
            .map(|lives| now_unix() + lives.saturating_sub(60) as i64),
    }
}

async fn finish_browser_connect(
    host: &str,
    kind: HostKind,
    base_url: &str,
    code: String,
    verifier: String,
    app: &tauri::AppHandle,
) -> Result<AccountView, ErrorView> {
    let tokens = match kind {
        HostKind::GitLab => {
            let client = gitlab::GitLab::new(base_url).map_err(host_error)?;
            let (access, refresh) = client
                .exchange_code(&code, &verifier)
                .await
                .map_err(host_error)?;
            storage::StoredTokens {
                access,
                refresh,
                expires_at: None,
            }
        }
        HostKind::GitHub => {
            stored_tokens_of(&relay::exchange("github", &code).await.map_err(host_error)?)
        }
        HostKind::Bitbucket => stored_tokens_of(
            &relay::exchange("bitbucket", &code)
                .await
                .map_err(host_error)?,
        ),
    };

    let client = Host::for_connection(kind, base_url).map_err(host_error)?;
    let account = client.account(&tokens.access).await.map_err(host_error)?;

    let dir = data_dir(app)?;
    storage::save_tokens(&dir, host, &tokens).map_err(host_error)?;
    remember(
        app,
        host,
        &storage::Known {
            account: Some(account.clone()),
            repos: remembered(app, host).repos,
        },
    );
    remember_connection(
        app,
        Connection {
            id: host.to_string(),
            kind,
            base_url: base_url.to_string(),
            login: account.login.clone(),
        },
    );
    if let Some(hosts) = app.try_state::<Hosts>() {
        hosts.keep_account(host, account.clone());
    }
    Ok(build_account(account))
}

fn authorize_url_for(
    kind: HostKind,
    base_url: &str,
    verifier: &str,
    nonce: &str,
) -> Result<String, ErrorView> {
    match kind {
        HostKind::GitHub => github::authorize_url(nonce).map_err(host_error),
        HostKind::Bitbucket => {
            if bitbucket::CLIENT_ID.is_empty() {
                return Err(ErrorView::new("host.notConfigured").param("host", "bitbucket"));
            }
            Ok(bitbucket::authorize_url(nonce))
        }
        HostKind::GitLab => {
            if gitlab::CLIENT_ID.is_empty() {
                return Err(ErrorView::new("host.notConfigured").param("host", "gitlab"));
            }
            Ok(pkce::authorize_url(
                base_url,
                gitlab::CLIENT_ID,
                gitlab::REDIRECT,
                &pkce::challenge(verifier),
                nonce,
            ))
        }
    }
}

#[tauri::command]
pub async fn start_connect(
    host: String,
    app: tauri::AppHandle,
    hosts: State<'_, Hosts>,
) -> Result<ConnectStartView, ErrorView> {
    let (kind, base_url) = known_def(&host)?;

    if let Some(url) = hosts.already_browsing(&host) {
        return Ok(ConnectStartView::BrowserAuth { url });
    }

    let verifier = pkce::verifier();
    let nonce = pkce::verifier();
    let url = authorize_url_for(kind, base_url, &verifier, &nonce)?;

    let seen = loopback::listen_once(nonce)
        .map_err(|e| ErrorView::new("host.portBusy").detail(e.to_string()))?;

    hosts.browse_for(&host, url.clone());
    let _ = tauri_plugin_opener::OpenerExt::opener(&app).open_url(&url, None::<&str>);

    let notify = app.clone();
    tauri::async_runtime::spawn(async move {
        let code = tauri::async_runtime::spawn_blocking(move || seen.recv().ok())
            .await
            .ok()
            .flatten();

        let outcome = match code {
            Some(code) => {
                finish_browser_connect(&host, kind, base_url, code, verifier, &notify).await
            }
            None => Err(ErrorView::new("host.denied")),
        };

        if let Some(hosts) = notify.try_state::<Hosts>() {
            hosts.stop_waiting(&host);
        }
        let _ = match outcome {
            Ok(account) => notify.emit(CONNECTED_EVENT, account),
            Err(error) => notify.emit(FAILED_EVENT, error),
        };
    });

    Ok(ConnectStartView::BrowserAuth { url })
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
pub async fn host_account(
    host: String,
    app: tauri::AppHandle,
    hosts: State<'_, Hosts>,
) -> Result<Option<AccountView>, ErrorView> {
    if let Some(account) = hosts.known_account(&host) {
        return Ok(Some(build_account(account)));
    }

    if let Some(account) = remembered(&app, &host).account {
        hosts.keep_account(&host, account.clone());
        return Ok(Some(build_account(account)));
    }

    let Some(token) = token(&app, &host) else {
        return Ok(None);
    };
    let Some(connection) = connection_of(&app, &host) else {
        return Ok(None);
    };

    let client = host_for(&connection)?;
    match client.account(&token).await {
        Ok(account) => {
            remember(
                &app,
                &host,
                &storage::Known {
                    account: Some(account.clone()),
                    repos: remembered(&app, &host).repos,
                },
            );
            hosts.keep_account(&host, account.clone());
            Ok(Some(build_account(account)))
        }
        Err(gitspy_hosts::Error::BadToken) => Ok(None),
        Err(other) => Err(host_error(other)),
    }
}

#[tauri::command]
pub async fn host_repos(
    host: String,
    refresh: bool,
    app: tauri::AppHandle,
    hosts: State<'_, Hosts>,
) -> Result<Vec<RepoListingView>, ErrorView> {
    known_def(&host)?;

    if !refresh {
        if let Some(found) = hosts.known_repos(&host) {
            return Ok(found.iter().map(build_repo_listing).collect());
        }

        let stored = remembered(&app, &host).repos;
        if !stored.is_empty() {
            let view = stored.iter().map(build_repo_listing).collect();
            hosts.keep_repos(&host, stored);
            return Ok(view);
        }
    }

    let token = fresh_access(&app, &host)
        .await
        .ok_or_else(|| host_error(gitspy_hosts::Error::NoToken))?;
    let connection =
        connection_of(&app, &host).ok_or_else(|| host_error(gitspy_hosts::Error::NoToken))?;

    let client = host_for(&connection)?;
    let repos = client.repos(&token, REPO_PAGES).await.map_err(host_error)?;

    let view = repos.iter().map(build_repo_listing).collect();
    remember(
        &app,
        &host,
        &storage::Known {
            account: remembered(&app, &host).account,
            repos: repos.clone(),
        },
    );
    hosts.keep_repos(&host, repos);
    Ok(view)
}

#[tauri::command]
pub async fn host_namespaces(
    host: String,
    app: tauri::AppHandle,
) -> Result<Vec<String>, ErrorView> {
    let connection =
        connection_of(&app, &host).ok_or_else(|| host_error(gitspy_hosts::Error::NoToken))?;
    let token = fresh_access(&app, &host)
        .await
        .ok_or_else(|| host_error(gitspy_hosts::Error::NoToken))?;
    host_for(&connection)?
        .namespaces(&token)
        .await
        .map_err(host_error)
}

#[tauri::command]
pub async fn host_create_repo(
    host: String,
    namespace: String,
    name: String,
    description: String,
    private: bool,
    app: tauri::AppHandle,
) -> Result<RepoListingView, ErrorView> {
    let connection =
        connection_of(&app, &host).ok_or_else(|| host_error(gitspy_hosts::Error::NoToken))?;
    let token = fresh_access(&app, &host)
        .await
        .ok_or_else(|| host_error(gitspy_hosts::Error::NoToken))?;
    let created = host_for(&connection)?
        .create_repo(&token, &namespace, &name, &description, private)
        .await
        .map_err(host_error)?;
    Ok(build_repo_listing(&created))
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

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
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

fn my_login(app: &tauri::AppHandle, hosts: &State<'_, Hosts>, host: &str) -> String {
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

fn pull_error(e: gitspy_hosts::Error) -> ErrorView {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_press_reuses_the_same_browser_url() {
        let hosts = Hosts::default();
        hosts.browse_for("gitlab", "https://gitlab.com/oauth/x".into());
        assert_eq!(
            hosts.already_browsing("gitlab").as_deref(),
            Some("https://gitlab.com/oauth/x"),
            "повторное нажатие не должно плодить слушателей и вкладок"
        );
        hosts.stop_waiting("gitlab");
        assert_eq!(hosts.already_browsing("gitlab"), None);
    }

    #[test]
    fn disconnecting_forgets_the_account_and_the_listing_together() {
        let hosts = Hosts::default();
        hosts.keep_account(
            "github",
            Account {
                host: "github".into(),
                login: "pr0d".into(),
                name: None,
                avatar_url: "u".into(),
            },
        );
        hosts.keep_repos("github", Vec::new());

        hosts.drop_everything("github");
        assert!(hosts.known_account("github").is_none());
        assert!(
            hosts.known_repos("github").is_none(),
            "оставленный список показал бы чужие репозитории после смены аккаунта"
        );
    }

    #[test]
    fn an_unknown_host_is_refused_before_any_request() {
        assert!(known_def("trello").is_err());
        assert!(known_def("github").is_ok());
        assert!(
            known_def("gitlab").is_ok(),
            "gitlab — полноправный провайдер, а не особый случай"
        );
    }
}
