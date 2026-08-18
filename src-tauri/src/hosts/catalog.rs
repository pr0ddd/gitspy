use super::*;
use crate::views::{build_account, build_repo_listing};
use crate::views::{AccountView, ErrorView, RepoListingView};
use tauri::State;

pub(crate) const REPO_PAGES: u32 = 10;

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
