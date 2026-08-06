use gitspy_hosts::github::Repo;
use gitspy_hosts::pulls::PullSummary;
use gitspy_hosts::secrets::{Files, Secrets};
use gitspy_hosts::host::HostKind;
use gitspy_hosts::Account;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Known {
    pub account: Option<Account>,
    #[serde(default)]
    pub repos: Vec<Repo>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub kind: HostKind,
    pub base_url: String,
    pub login: String,
}

fn connections_file(dir: &Path) -> PathBuf {
    dir.join("connections.json")
}

pub fn load_connections(dir: &Path) -> Vec<Connection> {
    if let Ok(text) = std::fs::read_to_string(connections_file(dir)) {
        if let Ok(found) = serde_json::from_str::<Vec<Connection>>(&text) {
            return found;
        }
    }
    let orphan = read(dir, "github");
    match orphan.account {
        Some(account) => vec![Connection {
            id: "github".into(),
            kind: HostKind::GitHub,
            base_url: "https://github.com".into(),
            login: account.login,
        }],
        None => Vec::new(),
    }
}

pub fn save_connections(dir: &Path, connections: &[Connection]) {
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    if let Ok(text) = serde_json::to_string_pretty(connections) {
        let _ = std::fs::write(connections_file(dir), text);
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StoredTokens {
    pub access: String,
    #[serde(default)]
    pub refresh: Option<String>,
    #[serde(default)]
    pub expires_at: Option<i64>,
}

pub fn read_tokens(dir: &Path, host: &str) -> Option<StoredTokens> {
    let raw = secrets(dir).read(host).ok().flatten()?;
    match serde_json::from_str::<StoredTokens>(&raw) {
        Ok(parsed) => Some(parsed),
        Err(_) => Some(StoredTokens {
            access: raw,
            refresh: None,
            expires_at: None,
        }),
    }
}

pub fn save_tokens(dir: &Path, host: &str, tokens: &StoredTokens) -> Result<(), gitspy_hosts::Error> {
    let text = serde_json::to_string(tokens).unwrap_or_else(|_| tokens.access.clone());
    secrets(dir).write(host, &text)
}

pub fn secrets(dir: &Path) -> Files {
    Files::at(dir)
}

fn file(dir: &Path, host: &str) -> PathBuf {
    dir.join(format!("host-{host}.json"))
}

pub fn read(dir: &Path, host: &str) -> Known {
    std::fs::read_to_string(file(dir, host))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save(dir: &Path, host: &str, known: &Known) {
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    if let Ok(text) = serde_json::to_string_pretty(known) {
        let _ = std::fs::write(file(dir, host), text);
    }
}

pub fn forget(dir: &Path, host: &str) {
    let _ = std::fs::remove_file(file(dir, host));
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnownPulls {
    #[serde(default)]
    pub pulls: Vec<PullSummary>,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default)]
    pub fetched_at: i64,
}

fn pulls_file(dir: &Path, host: &str, owner: &str, repo: &str) -> PathBuf {
    dir.join("pulls")
        .join(host)
        .join(format!("{owner}--{repo}.json"))
}

pub fn read_pulls(dir: &Path, host: &str, owner: &str, repo: &str) -> Option<KnownPulls> {
    std::fs::read_to_string(pulls_file(dir, host, owner, repo))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
}

pub fn save_pulls(dir: &Path, host: &str, owner: &str, repo: &str, known: &KnownPulls) {
    let target = pulls_file(dir, host, owner, repo);
    let Some(parent) = target.parent() else {
        return;
    };
    if std::fs::create_dir_all(parent).is_err() {
        return;
    }
    if let Ok(text) = serde_json::to_string(known) {
        let _ = std::fs::write(target, text);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn account() -> Account {
        Account {
            host: "github".into(),
            login: "pr0d".into(),
            name: None,
            avatar_url: "https://a/1".into(),
        }
    }

    #[test]
    fn a_remembered_account_is_read_back_without_asking_github() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        save(
            dir.path(),
            "github",
            &Known {
                account: Some(account()),
                repos: Vec::new(),
            },
        );
        assert_eq!(
            read(dir.path(), "github").account.map(|a| a.login),
            Some("pr0d".to_string()),
            "иначе стартовая страница пошла бы в сеть за тем, что уже знает"
        );
    }

    #[test]
    fn nothing_remembered_is_an_empty_answer_rather_than_a_failure() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        let known = read(dir.path(), "github");
        assert!(known.account.is_none() && known.repos.is_empty());
    }

    #[test]
    fn neighbouring_repositories_do_not_share_a_pull_cache() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        let known = KnownPulls {
            pulls: Vec::new(),
            truncated: true,
            fetched_at: 5,
        };
        save_pulls(dir.path(), "github", "facebook", "react", &known);

        assert!(read_pulls(dir.path(), "github", "facebook", "react").is_some());
        assert!(
            read_pulls(dir.path(), "github", "pr0ddd", "gitspy").is_none(),
            "иначе PR одного репозитория показались бы в другом"
        );
    }

    #[test]
    fn forgetting_a_host_leaves_its_neighbour_alone() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        save(
            dir.path(),
            "github",
            &Known {
                account: Some(account()),
                repos: Vec::new(),
            },
        );
        save(
            dir.path(),
            "gitlab",
            &Known {
                account: Some(account()),
                repos: Vec::new(),
            },
        );

        forget(dir.path(), "github");
        assert!(read(dir.path(), "github").account.is_none());
        assert!(read(dir.path(), "gitlab").account.is_some());
    }

    #[test]
    fn a_plain_old_token_reads_as_an_access_only_set() {
        let dir = TempDir::new().expect("временный каталог");
        secrets(dir.path()).write("github", "gho_plain").expect("пишется");
        assert_eq!(
            read_tokens(dir.path(), "github"),
            Some(StoredTokens {
                access: "gho_plain".into(),
                refresh: None,
                expires_at: None,
            }),
            "старый токен-строка не должен пропасть при переходе на токен-сеты"
        );
    }

    #[test]
    fn a_token_set_round_trips_with_refresh_and_expiry() {
        let dir = TempDir::new().expect("временный каталог");
        let wanted = StoredTokens {
            access: "bb".into(),
            refresh: Some("bbr".into()),
            expires_at: Some(1234567),
        };
        save_tokens(dir.path(), "bitbucket", &wanted).expect("пишется");
        assert_eq!(read_tokens(dir.path(), "bitbucket"), Some(wanted));
    }

    #[test]
    fn an_old_lone_github_account_reads_as_a_connection() {
        let dir = TempDir::new().expect("временный каталог");
        save(
            dir.path(),
            "github",
            &Known {
                account: Some(Account {
                    host: "github".into(),
                    login: "pr0ddd".into(),
                    name: None,
                    avatar_url: String::new(),
                }),
                repos: Vec::new(),
            },
        );

        let found = load_connections(dir.path());
        assert_eq!(
            found,
            vec![Connection {
                id: "github".into(),
                kind: HostKind::GitHub,
                base_url: "https://github.com".into(),
                login: "pr0ddd".into(),
            }],
            "старый одиночный аккаунт не должен пропасть при обновлении приложения"
        );
    }

    #[test]
    fn the_connection_list_round_trips() {
        let dir = TempDir::new().expect("временный каталог");
        let wanted = vec![Connection {
            id: "gitlab".into(),
            kind: HostKind::GitLab,
            base_url: "https://gitlab.com".into(),
            login: "dev".into(),
        }];
        save_connections(dir.path(), &wanted);
        assert_eq!(load_connections(dir.path()), wanted);
    }

}
