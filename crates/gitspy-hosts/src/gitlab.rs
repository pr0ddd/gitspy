use crate::pulls::{Comment, PullDetail, PullSummary};
use crate::relay::TokenSet;
use crate::{classify, github::Repo, Account, Error};
use serde::Deserialize;

pub const ID: &str = "gitlab";
pub const CLIENT_ID: &str = "8eb22227e51566cc06f44e6ef3b007d322f1b4751d1ae2b6ef9d296c3bcbcc30";
pub const REDIRECT: &str = "http://127.0.0.1:53682/callback";

fn unexpected(detail: impl ToString) -> Error {
    Error::Unexpected {
        status: 200,
        detail: detail.to_string(),
    }
}

#[derive(Debug, Deserialize)]
struct WireUser {
    username: String,
    name: Option<String>,
    #[serde(default)]
    avatar_url: String,
}

pub fn parse_account(body: &str) -> Result<Account, Error> {
    let user: WireUser = serde_json::from_str(body).map_err(unexpected)?;
    Ok(Account {
        host: ID.to_string(),
        login: user.username,
        name: user.name.filter(|n| !n.trim().is_empty()),
        avatar_url: user.avatar_url,
    })
}

#[derive(Debug, Deserialize)]
struct WireNamespace {
    #[serde(default)]
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WireProject {
    path_with_namespace: String,
    description: Option<String>,
    visibility: String,
    http_url_to_repo: String,
    ssh_url_to_repo: String,
    last_activity_at: Option<String>,
    #[serde(default)]
    avatar_url: Option<String>,
    namespace: Option<WireNamespace>,
}

fn repo_of(p: WireProject) -> Repo {
    Repo {
        full_name: p.path_with_namespace,
        description: p.description.filter(|d| !d.trim().is_empty()),
        private: p.visibility != "public",
        clone_url: p.http_url_to_repo,
        ssh_url: p.ssh_url_to_repo,
        pushed_at: p.last_activity_at,
        owner_avatar_url: p
            .avatar_url
            .or(p.namespace.and_then(|n| n.avatar_url))
            .unwrap_or_default(),
    }
}

pub fn parse_repo(body: &str) -> Result<Repo, Error> {
    let wire: WireProject = serde_json::from_str(body).map_err(unexpected)?;
    Ok(repo_of(wire))
}

pub fn parse_repos(body: &str) -> Result<Vec<Repo>, Error> {
    let entries: Vec<WireProject> = serde_json::from_str(body).map_err(unexpected)?;
    Ok(entries.into_iter().map(repo_of).collect())
}

#[derive(Debug, Deserialize)]
struct WireAuthor {
    username: String,
    #[serde(default)]
    avatar_url: String,
}

#[derive(Debug, Deserialize)]
struct WireMr {
    iid: u64,
    title: String,
    #[serde(default)]
    draft: bool,
    author: WireAuthor,
    source_branch: String,
    target_branch: String,
    source_project_id: u64,
    target_project_id: u64,
    updated_at: String,
    #[serde(default)]
    assignees: Vec<WireAuthor>,
    #[serde(default)]
    reviewers: Vec<WireAuthor>,
}

fn summary_of(mr: WireMr) -> PullSummary {
    PullSummary {
        number: mr.iid,
        title: mr.title,
        draft: mr.draft,
        author: mr.author.username,
        author_avatar_url: mr.author.avatar_url,
        head_branch: mr.source_branch,
        base_branch: mr.target_branch,
        from_fork: mr.source_project_id != mr.target_project_id,
        updated_at: mr.updated_at,
        assignees: mr.assignees.into_iter().map(|a| a.username).collect(),
        requested_reviewers: mr.reviewers.into_iter().map(|r| r.username).collect(),
    }
}

pub fn parse_pulls(body: &str) -> Result<Vec<PullSummary>, Error> {
    let wire: Vec<WireMr> = serde_json::from_str(body).map_err(unexpected)?;
    Ok(wire.into_iter().map(summary_of).collect())
}

#[derive(Debug, Deserialize)]
struct WireMrDetail {
    #[serde(flatten)]
    mr: WireMr,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    labels: Vec<String>,
    changes_count: Option<String>,
}

pub fn parse_pull_detail(body: &str) -> Result<PullDetail, Error> {
    let wire: WireMrDetail = serde_json::from_str(body).map_err(unexpected)?;
    let changed_files = wire
        .changes_count
        .as_deref()
        .map(|c| c.trim_end_matches('+').parse::<u64>().unwrap_or(0))
        .unwrap_or(0);
    Ok(PullDetail {
        summary: summary_of(wire.mr),
        body: wire.description.unwrap_or_default(),
        labels: wire.labels,
        changed_files,
        additions: 0,
        deletions: 0,
    })
}

#[derive(Debug, Deserialize)]
struct WireNote {
    author: WireAuthor,
    body: String,
    created_at: String,
    #[serde(default)]
    system: bool,
}

pub fn parse_comments(body: &str) -> Result<Vec<Comment>, Error> {
    let wire: Vec<WireNote> = serde_json::from_str(body).map_err(unexpected)?;
    Ok(wire
        .into_iter()
        .filter(|note| !note.system)
        .map(|note| Comment {
            author: note.author.username,
            author_avatar_url: note.author.avatar_url,
            body: note.body,
            created_at: note.created_at,
        })
        .collect())
}

#[derive(Debug, Deserialize)]
struct WireAvatar {
    avatar_url: String,
}

pub fn parse_avatar(body: &str) -> Result<String, Error> {
    let wire: WireAvatar = serde_json::from_str(body).map_err(unexpected)?;
    Ok(wire.avatar_url)
}

#[derive(Debug, Deserialize)]
struct WireCommit {
    author_email: Option<String>,
}

pub fn parse_commit_email(body: &str) -> Option<String> {
    serde_json::from_str::<WireCommit>(body)
        .ok()
        .and_then(|c| c.author_email)
}

#[derive(Debug, Deserialize)]
struct WireToken {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

pub fn parse_token(body: &str) -> Result<TokenSet, Error> {
    let wire: WireToken = serde_json::from_str(body).map_err(unexpected)?;
    Ok(TokenSet {
        access: wire.access_token,
        refresh: wire.refresh_token,
        expires_in: wire.expires_in,
    })
}

pub fn refresh_form(refresh: &str) -> [(&'static str, String); 4] {
    [
        ("client_id", CLIENT_ID.to_string()),
        ("grant_type", "refresh_token".to_string()),
        ("refresh_token", refresh.to_string()),
        ("redirect_uri", REDIRECT.to_string()),
    ]
}

pub struct GitLab {
    base_url: String,
    client: reqwest::Client,
}

impl GitLab {
    pub fn new(base_url: &str) -> Result<Self, Error> {
        let client = reqwest::Client::builder()
            .user_agent("gitspy")
            .build()
            .map_err(|e| Error::Network {
                detail: e.to_string(),
            })?;
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client,
        })
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn api(&self, path: &str) -> String {
        format!("{}/api/v4{path}", self.base_url)
    }

    async fn fetch(&self, url: &str, token: &str) -> Result<String, Error> {
        let response = self
            .client
            .get(url)
            .bearer_auth(token)
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
            .and_then(|v| v.parse().ok());
        let body = response.text().await.map_err(|e| Error::Network {
            detail: e.to_string(),
        })?;
        if status >= 400 {
            return Err(classify(status, &body, retry_after));
        }
        Ok(body)
    }

    pub async fn exchange_code(&self, code: &str, verifier: &str) -> Result<TokenSet, Error> {
        self.token_request(&[
            ("client_id", CLIENT_ID.to_string()),
            ("code", code.to_string()),
            ("grant_type", "authorization_code".to_string()),
            ("redirect_uri", REDIRECT.to_string()),
            ("code_verifier", verifier.to_string()),
        ])
        .await
    }

    pub async fn refresh(&self, refresh: &str) -> Result<TokenSet, Error> {
        self.token_request(&refresh_form(refresh)).await
    }

    async fn token_request(&self, form: &[(&str, String)]) -> Result<TokenSet, Error> {
        let response = self
            .client
            .post(format!("{}/oauth/token", self.base_url))
            .form(form)
            .send()
            .await
            .map_err(|e| Error::Network {
                detail: e.to_string(),
            })?;
        let status = response.status().as_u16();
        let body = response.text().await.map_err(|e| Error::Network {
            detail: e.to_string(),
        })?;
        if status >= 400 {
            return Err(classify(status, &body, None));
        }
        parse_token(&body)
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
            .post(self.api("/projects"))
            .bearer_auth(token)
            .json(&serde_json::json!({
                "name": name,
                "description": description,
                "visibility": if private { "private" } else { "public" },
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
        let body = self.fetch(&self.api("/user"), token).await?;
        parse_account(&body)
    }

    pub async fn repos(&self, token: &str, pages: u32) -> Result<Vec<Repo>, Error> {
        let mut all = Vec::new();
        for page in 1..=pages {
            let url = self.api(&format!(
                "/projects?membership=true&order_by=last_activity_at&per_page=100&page={page}"
            ));
            let found = parse_repos(&self.fetch(&url, token).await?)?;
            let last = found.len() < 100;
            all.extend(found);
            if last {
                break;
            }
        }
        Ok(all)
    }

    fn project(owner: &str, name: &str) -> String {
        format!("{owner}%2F{name}")
    }

    pub async fn pulls(
        &self,
        token: &str,
        owner: &str,
        name: &str,
    ) -> Result<Vec<PullSummary>, Error> {
        let url = self.api(&format!(
            "/projects/{}/merge_requests?state=opened&per_page=100",
            Self::project(owner, name)
        ));
        parse_pulls(&self.fetch(&url, token).await?)
    }

    pub async fn pull_detail(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        number: u64,
    ) -> Result<PullDetail, Error> {
        let url = self.api(&format!(
            "/projects/{}/merge_requests/{number}",
            Self::project(owner, name)
        ));
        parse_pull_detail(&self.fetch(&url, token).await?)
    }

    pub async fn pull_comments(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        number: u64,
    ) -> Result<Vec<Comment>, Error> {
        let url = self.api(&format!(
            "/projects/{}/merge_requests/{number}/notes?sort=asc&per_page=100",
            Self::project(owner, name)
        ));
        parse_comments(&self.fetch(&url, token).await?)
    }

    async fn avatar_by_email(&self, token: &str, email: &str) -> Option<String> {
        let encoded: String = email
            .bytes()
            .flat_map(|b| {
                if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
                    vec![b as char]
                } else {
                    format!("%{b:02X}").chars().collect()
                }
            })
            .collect();
        let url = self.api(&format!("/avatar?email={encoded}"));
        let body = self.fetch(&url, token).await.ok()?;
        parse_avatar(&body).ok()
    }

    pub async fn commit_author(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        hash: &str,
    ) -> Result<Option<(String, String)>, Error> {
        let url = self.api(&format!(
            "/projects/{}/repository/commits/{hash}",
            Self::project(owner, name)
        ));
        let body = match self.fetch(&url, token).await {
            Ok(body) => body,
            Err(Error::Unexpected { status: 404, .. }) => return Ok(None),
            Err(other) => return Err(other),
        };
        let Some(email) = parse_commit_email(&body) else {
            return Ok(None);
        };
        Ok(self
            .avatar_by_email(token, &email)
            .await
            .map(|avatar| (email.to_lowercase(), avatar)))
    }

    pub async fn commit_avatars(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        pages: u32,
    ) -> Result<Vec<(String, String)>, Error> {
        let mut found = Vec::new();
        for page in 1..=pages {
            let url = self.api(&format!(
                "/projects/{}/repository/commits?per_page=100&page={page}",
                Self::project(owner, name)
            ));
            let body = self.fetch(&url, token).await?;
            let commits: Vec<WireCommit> = serde_json::from_str(&body).map_err(unexpected)?;
            let last = commits.len() < 100;
            for commit in commits {
                if let Some(email) = commit.author_email {
                    let email = email.to_lowercase();
                    if found.iter().any(|(known, _)| known == &email) {
                        continue;
                    }
                    if let Some(avatar) = self.avatar_by_email(token, &email).await {
                        found.push((email, avatar));
                    }
                }
            }
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
    fn parse_account_maps_username_and_avatar() {
        let body =
            r#"{"username":"dev","name":"Dev Loper","avatar_url":"https://gitlab.com/a.png"}"#;
        let account = parse_account(body).expect("the account parses");
        assert_eq!(account.login, "dev");
        assert_eq!(account.name.as_deref(), Some("Dev Loper"));
        assert_eq!(account.host, ID);
    }

    #[test]
    fn parse_repos_maps_projects_into_the_common_repo() {
        let body = r#"[{
            "path_with_namespace": "group/tool",
            "description": " ",
            "visibility": "private",
            "http_url_to_repo": "https://gitlab.com/group/tool.git",
            "ssh_url_to_repo": "git@gitlab.com:group/tool.git",
            "last_activity_at": "2026-08-01T00:00:00Z",
            "avatar_url": null,
            "namespace": {"avatar_url": "https://gitlab.com/g.png"}
        }]"#;
        let repos = parse_repos(body).expect("the repositories parse");
        assert_eq!(repos[0].full_name, "group/tool");
        assert!(repos[0].private);
        assert_eq!(
            repos[0].description, None,
            "a blank description means no description, the same as in the github parser"
        );
        assert_eq!(repos[0].owner_avatar_url, "https://gitlab.com/g.png");
    }

    #[test]
    fn parse_pulls_maps_merge_requests_into_pull_summaries() {
        let body = r#"[{
            "iid": 7,
            "title": "Fix the thing",
            "draft": true,
            "author": {"username": "dev", "avatar_url": "https://gitlab.com/a.png"},
            "source_branch": "fix",
            "target_branch": "main",
            "source_project_id": 2,
            "target_project_id": 1,
            "updated_at": "2026-08-05T10:00:00Z",
            "assignees": [{"username": "rev"}],
            "reviewers": [{"username": "boss"}]
        }]"#;
        let pulls = parse_pulls(body).expect("the merge requests parse");
        let mr = &pulls[0];
        assert_eq!(
            mr.number, 7,
            "on GitLab the pull request number is the iid, not the global id"
        );
        assert!(mr.draft);
        assert!(
            mr.from_fork,
            "different source and target project ids mean the merge request comes from a fork"
        );
        assert_eq!(mr.head_branch, "fix");
        assert_eq!(mr.assignees, vec!["rev".to_string()]);
        assert_eq!(mr.requested_reviewers, vec!["boss".to_string()]);
    }

    #[test]
    fn parse_pull_detail_reads_description_and_changes_count() {
        let body = r#"{
            "iid": 7, "title": "T", "author": {"username": "dev"},
            "source_branch": "fix", "target_branch": "main",
            "source_project_id": 1, "target_project_id": 1,
            "updated_at": "2026-08-05T10:00:00Z",
            "description": "why and how",
            "labels": ["bug"],
            "changes_count": "3+"
        }"#;
        let detail = parse_pull_detail(body).expect("the detail parses");
        assert_eq!(detail.body, "why and how");
        assert_eq!(detail.labels, vec!["bug".to_string()]);
        assert_eq!(
            detail.changed_files, 3,
            "the gitlab changes_count of \"3+\" is read as a number"
        );
    }

    #[test]
    fn parse_comments_drops_system_notes() {
        let body = r#"[
            {"author": {"username": "bot"}, "body": "changed the description", "created_at": "t", "system": true},
            {"author": {"username": "dev", "avatar_url": "a"}, "body": "lgtm", "created_at": "t2", "system": false}
        ]"#;
        let comments = parse_comments(body).expect("the notes parse");
        assert_eq!(
            comments.len(),
            1,
            "system notes are noise, not part of the conversation"
        );
        assert_eq!(comments[0].author, "dev");
    }

    #[test]
    fn parse_avatar_reads_the_email_lookup_answer() {
        assert_eq!(
            parse_avatar(r#"{"avatar_url":"https://gitlab.com/u.png"}"#)
                .expect("the avatar parses"),
            "https://gitlab.com/u.png"
        );
    }

    #[test]
    fn statuses_classify_like_every_other_provider() {
        assert_eq!(classify(401, "", None).code(), "host.badToken");
        assert_eq!(classify(429, "", Some(30)).code(), "host.rateLimited");
    }

    #[test]
    fn parse_token_reads_access_and_refresh() {
        let set =
            parse_token(r#"{"access_token":"A","refresh_token":"R"}"#).expect("the token parses");
        let (access, refresh) = (set.access, set.refresh);
        assert_eq!(access, "A");
        assert_eq!(refresh.as_deref(), Some("R"));
    }

    #[test]
    fn the_token_lifetime_is_kept_because_gitlab_tokens_die_after_two_hours() {
        let set = parse_token(r#"{"access_token":"A","refresh_token":"R","expires_in":7200}"#)
            .expect("the token parses");
        assert_eq!(set.expires_in, Some(7200));
    }

    #[test]
    fn a_public_pkce_client_refreshes_with_its_id_and_redirect_and_no_secret() {
        let form = refresh_form("R");
        let of = |key: &str| {
            form.iter()
                .find(|(k, _)| *k == key)
                .map(|(_, v)| v.as_str())
        };
        assert_eq!(of("grant_type"), Some("refresh_token"));
        assert_eq!(of("refresh_token"), Some("R"));
        assert_eq!(of("client_id"), Some(CLIENT_ID));
        assert_eq!(of("redirect_uri"), Some(REDIRECT));
        assert!(
            of("client_secret").is_none(),
            "there is no secret in a desktop binary"
        );
    }
}
