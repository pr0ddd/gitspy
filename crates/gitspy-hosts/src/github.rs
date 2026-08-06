use crate::{classify, Account, Error};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub const ID: &str = "github";
const API: &str = "https://api.github.com";
const AGENT: &str = "gitspy";
const TIMEOUT: Duration = Duration::from_secs(15);

pub const CLIENT_ID: &str = "Ov23liXV2eyAvL4adXzb";

pub fn application() -> Result<&'static str, Error> {
    if CLIENT_ID.trim().is_empty() {
        return Err(Error::NoApplication);
    }
    Ok(CLIENT_ID)
}

pub fn authorize_url(state: &str) -> Result<String, Error> {
    let id = application()?;
    Ok(format!(
        "https://github.com/login/oauth/authorize?client_id={id}&redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback&scope=repo%20read%3Auser%20user%3Aemail&state={state}"
    ))
}

#[derive(Debug, Deserialize)]
struct User {
    login: String,
    name: Option<String>,
    avatar_url: String,
}

pub fn parse_account(body: &str) -> Result<Account, Error> {
    let user: User = serde_json::from_str(body).map_err(|e| Error::Unexpected {
        status: 200,
        detail: e.to_string(),
    })?;

    Ok(Account {
        host: ID.to_string(),
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    pub full_name: String,
    pub description: Option<String>,
    pub private: bool,
    pub clone_url: String,
    pub ssh_url: String,
    pub pushed_at: Option<String>,
    pub owner_avatar_url: String,
}

#[derive(Debug, Deserialize)]
struct RepoOwner {
    avatar_url: String,
}

#[derive(Debug, Deserialize)]
struct RepoEntry {
    full_name: String,
    description: Option<String>,
    private: bool,
    clone_url: String,
    ssh_url: String,
    pushed_at: Option<String>,
    owner: RepoOwner,
}

fn repo_of(entry: RepoEntry) -> Repo {
    Repo {
        full_name: entry.full_name,
        description: entry.description.filter(|d| !d.trim().is_empty()),
        private: entry.private,
        clone_url: entry.clone_url,
        ssh_url: entry.ssh_url,
        pushed_at: entry.pushed_at,
        owner_avatar_url: entry.owner.avatar_url,
    }
}

pub fn parse_repo(body: &str) -> Result<Repo, Error> {
    let entry: RepoEntry = serde_json::from_str(body).map_err(|e| Error::Unexpected {
        status: 200,
        detail: e.to_string(),
    })?;
    Ok(repo_of(entry))
}

pub fn parse_repos(body: &str) -> Result<Vec<Repo>, Error> {
    let entries: Vec<RepoEntry> = serde_json::from_str(body).map_err(|e| Error::Unexpected {
        status: 200,
        detail: e.to_string(),
    })?;

    Ok(entries.into_iter().map(repo_of).collect())
}

#[derive(Debug, Deserialize)]
struct CommitAuthor {
    avatar_url: String,
}

#[derive(Debug, Deserialize)]
struct CommitPerson {
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CommitDetail {
    author: Option<CommitPerson>,
}

#[derive(Debug, Deserialize)]
struct CommitEntry {
    author: Option<CommitAuthor>,
    commit: CommitDetail,
}

pub fn parse_commit_author(body: &str) -> Option<(String, String)> {
    let entry: CommitEntry = serde_json::from_str(body).ok()?;
    let author = entry.author?;
    let email = entry.commit.author.and_then(|a| a.email)?;
    Some((email.to_lowercase(), author.avatar_url))
}

#[cfg(test)]
mod commit_author_tests {
    use super::*;

    #[test]
    fn a_single_commit_names_its_author_and_avatar() {
        let body = r#"{"author":{"avatar_url":"https://a/u.png"},"commit":{"author":{"email":"X@E.com"}}}"#;
        assert_eq!(
            parse_commit_author(body),
            Some(("x@e.com".to_string(), "https://a/u.png".to_string())),
            "почта приводится к нижнему регистру, как весь индекс аватарок"
        );
    }

    #[test]
    fn a_commit_whose_author_has_no_github_account_gives_nothing() {
        let body = r#"{"author":null,"commit":{"author":{"email":"x@e.com"}}}"#;
        assert_eq!(
            parse_commit_author(body),
            None,
            "аккаунта нет — скачивать нечего, это честный отказ"
        );
    }

    #[test]
    fn garbage_from_the_network_is_a_refusal_not_a_crash() {
        assert_eq!(parse_commit_author("<html>"), None);
    }
}

pub fn parse_commit_avatars(body: &str) -> Result<Vec<(String, String)>, Error> {
    let entries: Vec<CommitEntry> = serde_json::from_str(body).map_err(|e| Error::Unexpected {
        status: 200,
        detail: e.to_string(),
    })?;

    let mut found: Vec<(String, String)> = Vec::new();
    for entry in entries {
        let (Some(author), Some(email)) = (entry.author, entry.commit.author.and_then(|a| a.email))
        else {
            continue;
        };
        let email = email.to_lowercase();
        if !found.iter().any(|(known, _)| known == &email) {
            found.push((email, author.avatar_url));
        }
    }
    Ok(found)
}

pub struct GitHub {
    client: reqwest::Client,
}

impl GitHub {
    pub fn new() -> Result<Self, Error> {
        let client = reqwest::Client::builder()
            .user_agent(AGENT)
            .timeout(TIMEOUT)
            .build()
            .map_err(|e| Error::Network {
                detail: e.to_string(),
            })?;
        Ok(Self { client })
    }

    pub(crate) async fn get(&self, token: &str, url: &str) -> Result<String, Error> {
        let response = self
            .client
            .get(url)
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|e| Error::Network {
                detail: e.to_string(),
            })?;

        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());
        let body = response.text().await.unwrap_or_default();

        if (200..300).contains(&status) {
            return Ok(body);
        }
        Err(classify(status, &body, retry_after))
    }

    pub async fn create_repo(
        &self,
        token: &str,
        name: &str,
        description: &str,
        private: bool,
    ) -> Result<Repo, Error> {
        let response = self
            .client
            .post("https://api.github.com/user/repos")
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .json(&serde_json::json!({
                "name": name,
                "description": description,
                "private": private,
            }))
            .send()
            .await
            .map_err(|e| Error::Network {
                detail: e.to_string(),
            })?;
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        if status >= 400 {
            return Err(classify(status, &body, None));
        }
        parse_repo(&body)
    }

    pub async fn account(&self, token: &str) -> Result<Account, Error> {
        if token.trim().is_empty() {
            return Err(Error::NoToken);
        }
        parse_account(&self.get(token, &format!("{API}/user")).await?)
    }

    pub async fn commit_author(
        &self,
        token: &str,
        owner: &str,
        repo: &str,
        sha: &str,
    ) -> Result<Option<(String, String)>, Error> {
        let url = format!("{API}/repos/{owner}/{repo}/commits/{sha}");
        match self.get(token, &url).await {
            Ok(body) => Ok(parse_commit_author(&body)),
            Err(Error::Unexpected { status: 404, .. }) => Ok(None),
            Err(other) => Err(other),
        }
    }

    pub async fn commit_avatars(
        &self,
        token: &str,
        owner: &str,
        repo: &str,
        pages: u32,
    ) -> Result<Vec<(String, String)>, Error> {
        let mut found: Vec<(String, String)> = Vec::new();
        for page in 1..=pages.max(1) {
            let url = format!("{API}/repos/{owner}/{repo}/commits?per_page=100&page={page}");
            let batch = parse_commit_avatars(&self.get(token, &url).await?)?;
            let empty = batch.is_empty();
            for (email, avatar) in batch {
                if !found.iter().any(|(known, _)| known == &email) {
                    found.push((email, avatar));
                }
            }
            if empty {
                break;
            }
        }
        Ok(found)
    }

    pub async fn repos(&self, token: &str, pages: u32) -> Result<Vec<Repo>, Error> {
        let mut found: Vec<Repo> = Vec::new();

        for page in 1..=pages.max(1) {
            let url = format!(
                "{API}/user/repos?per_page=100&page={page}&sort=pushed\
                 &affiliation=owner,collaborator,organization_member"
            );
            let batch = parse_repos(&self.get(token, &url).await?)?;
            let last = batch.len() < 100;
            found.extend(batch);
            if last {
                break;
            }
        }
        Ok(found)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_account_is_read_from_the_answer() {
        let account = parse_account(
            r#"{"login":"pr0d","name":"Pavel","avatar_url":"https://avatars.example/1"}"#,
        )
        .expect("разбирается");
        assert_eq!(account.host, "github");
        assert_eq!(account.login, "pr0d");
        assert_eq!(account.name.as_deref(), Some("Pavel"));
    }

    #[test]
    fn an_account_without_a_name_is_still_an_account() {
        let account =
            parse_account(r#"{"login":"pr0d","name":null,"avatar_url":"u"}"#).expect("разбирается");
        assert_eq!(account.name, None);
    }

    #[test]
    fn a_broken_answer_does_not_pass_for_an_account() {
        assert!(parse_account("не json").is_err());
    }

    #[tokio::test]
    async fn an_empty_token_never_leaves_the_process() {
        let error = GitHub::new()
            .expect("клиент")
            .account("   ")
            .await
            .expect_err("пусто");
        assert_eq!(error, Error::NoToken);
    }

                                #[test]
    fn a_repository_keeps_both_addresses_because_the_person_chooses_how_to_clone() {
        let repos = parse_repos(
            r#"[{"full_name":"pr0ddd/gitspy","description":"клиент git","private":true,
                 "clone_url":"https://github.com/pr0ddd/gitspy.git",
                 "ssh_url":"git@github.com:pr0ddd/gitspy.git",
                 "pushed_at":"2026-08-01T10:00:00Z",
                 "owner":{"avatar_url":"https://a/1"}}]"#,
        )
        .expect("разбирается");
        assert_eq!(repos.len(), 1);
        assert!(repos[0].private);
        assert_eq!(repos[0].clone_url, "https://github.com/pr0ddd/gitspy.git");
        assert_eq!(repos[0].ssh_url, "git@github.com:pr0ddd/gitspy.git");
    }

    #[test]
    fn an_empty_description_is_absent_rather_than_an_empty_line_in_the_list() {
        let repos = parse_repos(
            r#"[{"full_name":"a/b","description":"  ","private":false,"clone_url":"u",
                 "ssh_url":"s","pushed_at":null,"owner":{"avatar_url":"a"}}]"#,
        )
        .expect("разбирается");
        assert_eq!(repos[0].description, None);
    }
}

#[cfg(test)]
mod avatar_tests {
    use super::*;

    #[test]
    fn avatars_are_matched_to_the_commit_email() {
        let found = parse_commit_avatars(
            r#"[{"author":{"login":"pr0d","avatar_url":"https://a/1"},
                 "commit":{"author":{"email":"Pavel@Example.com"}}}]"#,
        )
        .expect("разбирается");
        assert_eq!(
            found,
            vec![("pavel@example.com".to_string(), "https://a/1".to_string())],
            "почта сравнивается без регистра"
        );
    }

    #[test]
    fn a_commit_whose_author_is_not_a_user_is_skipped_rather_than_guessed() {
        let found = parse_commit_avatars(
            r#"[{"author":null,"commit":{"author":{"email":"nobody@example.com"}}}]"#,
        )
        .expect("разбирается");
        assert!(found.is_empty());
    }

    #[test]
    fn the_same_person_is_not_returned_twice() {
        let found = parse_commit_avatars(
            r#"[{"author":{"login":"a","avatar_url":"u"},"commit":{"author":{"email":"a@e"}}},
                {"author":{"login":"a","avatar_url":"u"},"commit":{"author":{"email":"a@e"}}}]"#,
        )
        .expect("разбирается");
        assert_eq!(found.len(), 1);
    }
}
