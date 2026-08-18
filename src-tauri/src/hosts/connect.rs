use super::*;
use crate::paths::data_dir;
use crate::views::build_account;
use crate::views::{AccountView, ConnectStartView, ErrorView};
use gitspy_hosts::github::{self};
use gitspy_hosts::host::{Host, HostKind};
use gitspy_hosts::{bitbucket, gitlab, pkce, relay};
use storage::Connection;
use tauri::{Emitter, Manager, State};

pub(crate) async fn finish_browser_connect(
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
            stored_tokens_of(
                &client
                    .exchange_code(&code, &verifier)
                    .await
                    .map_err(host_error)?,
            )
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

pub(crate) fn authorize_url_for(
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
