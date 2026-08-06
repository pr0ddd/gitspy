use crate::pulls::{Comment, PullDetail, PullSummary};
use crate::{classify, github::Repo, Account, Error};
use serde::Deserialize;

pub const ID: &str = "bitbucket";
pub const CLIENT_ID: &str = "";
pub const BASE_URL: &str = "https://bitbucket.org";
const API: &str = "https://api.bitbucket.org/2.0";

fn unexpected(detail: impl ToString) -> Error {
    Error::Unexpected {
        status: 200,
        detail: detail.to_string(),
    }
}

pub fn authorize_url(state: &str) -> String {
    format!(
        "{BASE_URL}/site/oauth2/authorize?client_id={CLIENT_ID}&response_type=code&state={state}"
    )
}

#[derive(Debug, Deserialize, Default)]
struct WireLinks {
    #[serde(default)]
    avatar: Option<WireHref>,
    #[serde(default)]
    clone: Vec<WireClone>,
}

#[derive(Debug, Deserialize)]
struct WireHref {
    href: String,
}

#[derive(Debug, Deserialize)]
struct WireClone {
    name: String,
    href: String,
}

#[derive(Debug, Deserialize)]
struct WireUser {
    username: Option<String>,
    nickname: Option<String>,
    display_name: Option<String>,
    #[serde(default)]
    links: Option<WireLinks>,
}

impl WireUser {
    fn login(&self) -> String {
        self.username
            .clone()
            .or(self.nickname.clone())
            .or(self.display_name.clone())
            .unwrap_or_default()
    }

    fn avatar(&self) -> String {
        self.links
            .as_ref()
            .and_then(|l| l.avatar.as_ref())
            .map(|a| a.href.clone())
            .unwrap_or_default()
    }
}

pub fn parse_account(body: &str) -> Result<Account, Error> {
    let user: WireUser = serde_json::from_str(body).map_err(unexpected)?;
    Ok(Account {
        host: ID.to_string(),
        login: user.login(),
        name: user.display_name.clone().filter(|n| !n.trim().is_empty()),
        avatar_url: user.avatar(),
    })
}

#[derive(Debug, Deserialize)]
struct WirePage<T> {
    #[serde(default = "Vec::new")]
    values: Vec<T>,
    #[serde(default)]
    next: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WireRepo {
    full_name: String,
    description: Option<String>,
    is_private: bool,
    updated_on: Option<String>,
    #[serde(default)]
    links: Option<WireLinks>,
}

fn repo_of(wire: WireRepo) -> Repo {
    let links = wire.links.unwrap_or_default();
    let by_name = |wanted: &str| {
        links
            .clone
            .iter()
            .find(|c| c.name == wanted)
            .map(|c| c.href.clone())
            .unwrap_or_default()
    };
    Repo {
        full_name: wire.full_name,
        description: wire.description.filter(|d| !d.trim().is_empty()),
        private: wire.is_private,
        clone_url: by_name("https"),
        ssh_url: by_name("ssh"),
        pushed_at: wire.updated_on,
        owner_avatar_url: links
            .avatar
            .as_ref()
            .map(|a| a.href.clone())
            .unwrap_or_default(),
    }
}

pub fn parse_repos(body: &str) -> Result<(Vec<Repo>, Option<String>), Error> {
    let page: WirePage<WireRepo> = serde_json::from_str(body).map_err(unexpected)?;
    Ok((page.values.into_iter().map(repo_of).collect(), page.next))
}

#[derive(Debug, Deserialize)]
struct WireBranch {
    branch: Option<WireBranchName>,
    repository: Option<WireRepoRef>,
}

#[derive(Debug, Deserialize)]
struct WireBranchName {
    name: String,
}

#[derive(Debug, Deserialize)]
struct WireRepoRef {
    full_name: String,
}

#[derive(Debug, Deserialize)]
struct WirePull {
    id: u64,
    title: String,
    #[serde(default)]
    draft: bool,
    author: Option<WireUser>,
    source: WireBranch,
    destination: WireBranch,
    updated_on: String,
    #[serde(default)]
    reviewers: Vec<WireUser>,
}

fn branch_of(side: &WireBranch) -> String {
    side.branch
        .as_ref()
        .map(|b| b.name.clone())
        .unwrap_or_default()
}

fn summary_of(pull: WirePull) -> PullSummary {
    let from_fork = match (&pull.source.repository, &pull.destination.repository) {
        (Some(source), Some(destination)) => source.full_name != destination.full_name,
        _ => false,
    };
    PullSummary {
        number: pull.id,
        title: pull.title,
        draft: pull.draft,
        author: pull.author.as_ref().map(WireUser::login).unwrap_or_default(),
        author_avatar_url: pull.author.as_ref().map(WireUser::avatar).unwrap_or_default(),
        head_branch: branch_of(&pull.source),
        base_branch: branch_of(&pull.destination),
        from_fork,
        updated_at: pull.updated_on,
        assignees: Vec::new(),
        requested_reviewers: pull.reviewers.iter().map(WireUser::login).collect(),
    }
}

pub fn parse_pulls(body: &str) -> Result<Vec<PullSummary>, Error> {
    let page: WirePage<WirePull> = serde_json::from_str(body).map_err(unexpected)?;
    Ok(page.values.into_iter().map(summary_of).collect())
}

#[derive(Debug, Deserialize)]
struct WirePullDetail {
    #[serde(flatten)]
    pull: WirePull,
    #[serde(default)]
    summary: Option<WireRendered>,
}

#[derive(Debug, Deserialize)]
struct WireRendered {
    #[serde(default)]
    raw: String,
}

pub fn parse_pull_detail(body: &str) -> Result<PullDetail, Error> {
    let wire: WirePullDetail = serde_json::from_str(body).map_err(unexpected)?;
    Ok(PullDetail {
        body: wire.summary.map(|s| s.raw).unwrap_or_default(),
        summary: summary_of(wire.pull),
        labels: Vec::new(),
        changed_files: 0,
        additions: 0,
        deletions: 0,
    })
}

#[derive(Debug, Deserialize)]
struct WireComment {
    user: Option<WireUser>,
    content: Option<WireRendered>,
    created_on: String,
}

pub fn parse_comments(body: &str) -> Result<Vec<Comment>, Error> {
    let page: WirePage<WireComment> = serde_json::from_str(body).map_err(unexpected)?;
    Ok(page
        .values
        .into_iter()
        .filter(|c| {
            c.content
                .as_ref()
                .map(|body| !body.raw.trim().is_empty())
                .unwrap_or(false)
        })
        .map(|c| Comment {
            author: c.user.as_ref().map(WireUser::login).unwrap_or_default(),
            author_avatar_url: c.user.as_ref().map(WireUser::avatar).unwrap_or_default(),
            body: c.content.map(|b| b.raw).unwrap_or_default(),
            created_at: c.created_on,
        })
        .collect())
}

#[derive(Debug, Deserialize)]
struct WireCommitAuthor {
    raw: Option<String>,
    user: Option<WireUser>,
}

#[derive(Debug, Deserialize)]
struct WireCommit {
    author: Option<WireCommitAuthor>,
}

pub fn email_of_raw(raw: &str) -> Option<String> {
    let start = raw.find('<')?;
    let end = raw.find('>')?;
    let email = raw.get(start + 1..end)?.trim().to_lowercase();
    (!email.is_empty()).then_some(email)
}

pub fn parse_commit_avatar(body: &str) -> Option<(String, String)> {
    let commit: WireCommit = serde_json::from_str(body).ok()?;
    let author = commit.author?;
    let email = email_of_raw(author.raw.as_deref()?)?;
    let avatar = author.user?.avatar();
    (!avatar.is_empty()).then_some((email, avatar))
}

pub struct Bitbucket {
    client: reqwest::Client,
}

impl Bitbucket {
    pub fn new() -> Result<Self, Error> {
        let client = reqwest::Client::builder()
            .user_agent("gitspy")
            .build()
            .map_err(|e| Error::Network {
                detail: e.to_string(),
            })?;
        Ok(Self { client })
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

    pub async fn account(&self, token: &str) -> Result<Account, Error> {
        parse_account(&self.fetch(&format!("{API}/user"), token).await?)
    }

    pub async fn repos(&self, token: &str, pages: u32) -> Result<Vec<Repo>, Error> {
        let mut all = Vec::new();
        let mut url = format!("{API}/repositories?role=member&sort=-updated_on&pagelen=100");
        for _ in 0..pages {
            let (found, next) = parse_repos(&self.fetch(&url, token).await?)?;
            all.extend(found);
            match next {
                Some(following) => url = following,
                None => break,
            }
        }
        Ok(all)
    }

    pub async fn pulls(
        &self,
        token: &str,
        owner: &str,
        name: &str,
    ) -> Result<Vec<PullSummary>, Error> {
        let url = format!("{API}/repositories/{owner}/{name}/pullrequests?state=OPEN&pagelen=50");
        parse_pulls(&self.fetch(&url, token).await?)
    }

    pub async fn pull_detail(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        number: u64,
    ) -> Result<PullDetail, Error> {
        let url = format!("{API}/repositories/{owner}/{name}/pullrequests/{number}");
        parse_pull_detail(&self.fetch(&url, token).await?)
    }

    pub async fn pull_comments(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        number: u64,
    ) -> Result<Vec<Comment>, Error> {
        let url =
            format!("{API}/repositories/{owner}/{name}/pullrequests/{number}/comments?pagelen=100");
        parse_comments(&self.fetch(&url, token).await?)
    }

    pub async fn commit_author(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        hash: &str,
    ) -> Option<(String, String)> {
        let url = format!("{API}/repositories/{owner}/{name}/commit/{hash}");
        let body = self.fetch(&url, token).await.ok()?;
        parse_commit_avatar(&body)
    }

    pub async fn commit_avatars(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        pages: u32,
    ) -> Result<Vec<(String, String)>, Error> {
        let mut found: Vec<(String, String)> = Vec::new();
        let mut url = format!("{API}/repositories/{owner}/{name}/commits?pagelen=100");
        for _ in 0..pages {
            let body = self.fetch(&url, token).await?;
            let page: WirePage<WireCommit> = serde_json::from_str(&body).map_err(unexpected)?;
            for commit in page.values {
                let Some(author) = commit.author else { continue };
                let Some(email) = author.raw.as_deref().and_then(email_of_raw) else {
                    continue;
                };
                if found.iter().any(|(known, _)| known == &email) {
                    continue;
                }
                let avatar = author.user.map(|u| u.avatar()).unwrap_or_default();
                if !avatar.is_empty() {
                    found.push((email, avatar));
                }
            }
            match page.next {
                Some(following) => url = following,
                None => break,
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
        let body = r#"{"username":"dev","display_name":"Dev Loper","links":{"avatar":{"href":"https://bb/a.png"}}}"#;
        let account = parse_account(body).expect("аккаунт читается");
        assert_eq!(account.login, "dev");
        assert_eq!(account.name.as_deref(), Some("Dev Loper"));
        assert_eq!(account.avatar_url, "https://bb/a.png");
        assert_eq!(account.host, ID);
    }

    #[test]
    fn parse_repos_maps_the_page_and_carries_the_next_link() {
        let body = r#"{"values":[{
            "full_name": "team/tool",
            "description": "",
            "is_private": true,
            "updated_on": "2026-08-01T00:00:00Z",
            "links": {
                "avatar": {"href": "https://bb/t.png"},
                "clone": [
                    {"name": "https", "href": "https://bitbucket.org/team/tool.git"},
                    {"name": "ssh", "href": "git@bitbucket.org:team/tool.git"}
                ]
            }
        }], "next": "https://api.bitbucket.org/2.0/repositories?page=2"}"#;
        let (repos, next) = parse_repos(body).expect("репозитории читаются");
        assert_eq!(repos[0].full_name, "team/tool");
        assert!(repos[0].private);
        assert_eq!(repos[0].description, None, "пустое описание — отсутствие");
        assert_eq!(repos[0].clone_url, "https://bitbucket.org/team/tool.git");
        assert_eq!(repos[0].ssh_url, "git@bitbucket.org:team/tool.git");
        assert!(next.is_some(), "битбакет листается по next-ссылке, а не номеру страницы");
    }

    #[test]
    fn parse_pulls_maps_bitbucket_pull_requests() {
        let body = r#"{"values":[{
            "id": 5,
            "title": "Fix",
            "draft": false,
            "author": {"nickname": "dev", "links": {"avatar": {"href": "a"}}},
            "source": {"branch": {"name": "fix"}, "repository": {"full_name": "fork/tool"}},
            "destination": {"branch": {"name": "main"}, "repository": {"full_name": "team/tool"}},
            "updated_on": "2026-08-05T10:00:00Z",
            "reviewers": [{"nickname": "boss"}]
        }]}"#;
        let pulls = parse_pulls(body).expect("пуллы читаются");
        let pull = &pulls[0];
        assert_eq!(pull.number, 5);
        assert_eq!(pull.head_branch, "fix");
        assert!(pull.from_fork, "разные full_name источника и цели — это форк");
        assert_eq!(pull.requested_reviewers, vec!["boss".to_string()]);
    }

    #[test]
    fn parse_pull_detail_reads_the_summary_body() {
        let body = r#"{
            "id": 5, "title": "T",
            "source": {"branch": {"name": "fix"}},
            "destination": {"branch": {"name": "main"}},
            "updated_on": "t",
            "summary": {"raw": "why and how"}
        }"#;
        let detail = parse_pull_detail(body).expect("деталь читается");
        assert_eq!(detail.body, "why and how");
    }

    #[test]
    fn parse_comments_drops_empty_system_stubs() {
        let body = r#"{"values":[
            {"user": {"nickname": "dev"}, "content": {"raw": "lgtm"}, "created_on": "t"},
            {"user": {"nickname": "bot"}, "content": {"raw": ""}, "created_on": "t2"}
        ]}"#;
        let comments = parse_comments(body).expect("комментарии читаются");
        assert_eq!(comments.len(), 1, "пустые заглушки — шум, а не разговор");
        assert_eq!(comments[0].author, "dev");
    }

    #[test]
    fn the_commit_author_email_comes_out_of_the_raw_signature() {
        assert_eq!(
            email_of_raw("Dev Loper <Dev@Example.com>"),
            Some("dev@example.com".to_string()),
            "email в нижний регистр — так же, как везде в аватарках"
        );
        assert_eq!(email_of_raw("no email here"), None);
    }

    #[test]
    fn parse_commit_avatar_needs_both_email_and_picture() {
        let body = r#"{"author": {"raw": "D <d@e.com>", "user": {"links": {"avatar": {"href": "u"}}}}}"#;
        assert_eq!(
            parse_commit_avatar(body),
            Some(("d@e.com".to_string(), "u".to_string()))
        );
        assert_eq!(
            parse_commit_avatar(r#"{"author": {"raw": "D <d@e.com>"}}"#),
            None,
            "автор без bitbucket-аккаунта аватара не даёт — и не выдумывается"
        );
    }

    #[test]
    fn statuses_classify_like_every_other_provider() {
        assert_eq!(classify(401, "", None).code(), "host.badToken");
        assert_eq!(classify(429, "", Some(30)).code(), "host.rateLimited");
    }

    #[test]
    fn the_authorize_url_carries_code_response_and_state() {
        let url = authorize_url("st");
        assert!(url.starts_with("https://bitbucket.org/site/oauth2/authorize?"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("state=st"));
    }
}
