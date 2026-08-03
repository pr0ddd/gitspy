use crate::{classify, Error};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullSummary {
    pub number: u64,
    pub title: String,
    pub draft: bool,
    pub author: String,
    pub author_avatar_url: String,
    pub head_branch: String,
    pub base_branch: String,
    pub from_fork: bool,
    pub updated_at: String,
    pub assignees: Vec<String>,
    pub requested_reviewers: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PullDetail {
    pub summary: PullSummary,
    pub body: String,
    pub labels: Vec<String>,
    pub changed_files: u64,
    pub additions: u64,
    pub deletions: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Comment {
    pub author: String,
    pub author_avatar_url: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
struct WireUser {
    login: String,
    #[serde(default)]
    avatar_url: String,
}

#[derive(Debug, Deserialize)]
struct WireRepo {
    full_name: String,
}

#[derive(Debug, Deserialize)]
struct WireSide {
    #[serde(rename = "ref")]
    branch: String,
    repo: Option<WireRepo>,
}

#[derive(Debug, Deserialize)]
struct WireLabel {
    name: String,
}

#[derive(Debug, Deserialize)]
struct WirePull {
    number: u64,
    title: String,
    #[serde(default)]
    draft: bool,
    user: Option<WireUser>,
    head: WireSide,
    base: WireSide,
    updated_at: String,
    #[serde(default)]
    assignees: Vec<WireUser>,
    #[serde(default)]
    requested_reviewers: Vec<WireUser>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    labels: Vec<WireLabel>,
    #[serde(default)]
    changed_files: u64,
    #[serde(default)]
    additions: u64,
    #[serde(default)]
    deletions: u64,
}

fn broken(e: serde_json::Error) -> Error {
    Error::Unexpected {
        status: 200,
        detail: e.to_string(),
    }
}

fn summary_of(wire: &WirePull) -> PullSummary {
    let base_repo = wire.base.repo.as_ref().map(|r| r.full_name.as_str());
    let head_repo = wire.head.repo.as_ref().map(|r| r.full_name.as_str());

    PullSummary {
        number: wire.number,
        title: wire.title.clone(),
        draft: wire.draft,
        author: wire
            .user
            .as_ref()
            .map(|u| u.login.clone())
            .unwrap_or_default(),
        author_avatar_url: wire
            .user
            .as_ref()
            .map(|u| u.avatar_url.clone())
            .unwrap_or_default(),
        head_branch: wire.head.branch.clone(),
        base_branch: wire.base.branch.clone(),
        from_fork: head_repo.is_none() || head_repo != base_repo,
        updated_at: wire.updated_at.clone(),
        assignees: wire.assignees.iter().map(|u| u.login.clone()).collect(),
        requested_reviewers: wire
            .requested_reviewers
            .iter()
            .map(|u| u.login.clone())
            .collect(),
    }
}

pub fn parse_pulls(body: &str) -> Result<Vec<PullSummary>, Error> {
    let wires: Vec<WirePull> = serde_json::from_str(body).map_err(broken)?;
    Ok(wires.iter().map(summary_of).collect())
}

pub fn parse_pull_detail(body: &str) -> Result<PullDetail, Error> {
    let wire: WirePull = serde_json::from_str(body).map_err(broken)?;
    Ok(PullDetail {
        summary: summary_of(&wire),
        body: wire.body.unwrap_or_default(),
        labels: wire.labels.iter().map(|l| l.name.clone()).collect(),
        changed_files: wire.changed_files,
        additions: wire.additions,
        deletions: wire.deletions,
    })
}

#[derive(Debug, Deserialize)]
struct WireComment {
    user: Option<WireUser>,
    #[serde(default)]
    body: String,
    created_at: String,
}

pub fn parse_comments(body: &str) -> Result<Vec<Comment>, Error> {
    let wires: Vec<WireComment> = serde_json::from_str(body).map_err(broken)?;
    Ok(wires
        .into_iter()
        .map(|wire| Comment {
            author: wire
                .user
                .as_ref()
                .map(|u| u.login.clone())
                .unwrap_or_default(),
            author_avatar_url: wire
                .user
                .as_ref()
                .map(|u| u.avatar_url.clone())
                .unwrap_or_default(),
            body: wire.body,
            created_at: wire.created_at,
        })
        .collect())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Group {
    Mine,
    Assigned,
    AwaitingMyReview,
}

pub fn groups_of(pull: &PullSummary, my_login: &str) -> Vec<Group> {
    let mut found = Vec::new();
    if pull.author == my_login {
        found.push(Group::Mine);
    }
    if pull.assignees.iter().any(|l| l == my_login) {
        found.push(Group::Assigned);
    }
    if pull.requested_reviewers.iter().any(|l| l == my_login) {
        found.push(Group::AwaitingMyReview);
    }
    found
}

pub const PULL_PAGE: u32 = 100;
pub const PULL_PAGES: u32 = 5;

impl super::github::GitHub {
    pub async fn pulls(
        &self,
        token: &str,
        owner: &str,
        repo: &str,
    ) -> Result<(Vec<PullSummary>, bool), Error> {
        let mut found = Vec::new();
        let mut truncated = false;

        for page in 1..=PULL_PAGES {
            let url = format!(
                "https://api.github.com/repos/{owner}/{repo}/pulls\
                 ?state=open&per_page={PULL_PAGE}&page={page}"
            );
            let batch = parse_pulls(&self.get(token, &url).await?)?;
            let last = (batch.len() as u32) < PULL_PAGE;
            found.extend(batch);
            if last {
                return Ok((found, false));
            }
            truncated = page == PULL_PAGES;
        }
        Ok((found, truncated))
    }

    pub async fn pull_detail(
        &self,
        token: &str,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<PullDetail, Error> {
        let url = format!("https://api.github.com/repos/{owner}/{repo}/pulls/{number}");
        parse_pull_detail(&self.get(token, &url).await?)
    }

    pub async fn pull_comments(
        &self,
        token: &str,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<Vec<Comment>, Error> {
        let url = format!(
            "https://api.github.com/repos/{owner}/{repo}/issues/{number}/comments?per_page=100"
        );
        parse_comments(&self.get(token, &url).await?)
    }
}

pub fn classify_pull_error(status: u16, body: &str) -> Error {
    if status == 404 {
        return Error::Unexpected {
            status,
            detail: "pull.gone".to_string(),
        };
    }
    classify(status, body, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PULL: &str = r#"{
        "number": 37184,
        "title": "Fix useOptimistic rollback",
        "draft": false,
        "user": {"login": "fresh3nough", "avatar_url": "https://a/1"},
        "head": {"ref": "fix/useoptimistic", "repo": {"full_name": "fresh3nough/react"}},
        "base": {"ref": "main", "repo": {"full_name": "facebook/react"}},
        "updated_at": "2026-08-03T10:00:00Z",
        "assignees": [{"login": "someone"}],
        "requested_reviewers": [{"login": "pr0d"}]
    }"#;

    #[test]
    fn a_pull_from_a_fork_is_told_apart_from_a_branch_of_the_repository() {
        let pulls = parse_pulls(&format!("[{PULL}]")).expect("разбирается");
        assert!(
            pulls[0].from_fork,
            "иначе checkout пойдёт за веткой, которой в origin нет"
        );

        let same = PULL.replace("fresh3nough/react", "facebook/react");
        let pulls = parse_pulls(&format!("[{same}]")).expect("разбирается");
        assert!(!pulls[0].from_fork);
    }

    #[test]
    fn a_deleted_fork_counts_as_a_fork_rather_than_crashing() {
        let gone = PULL.replace(
            r#""repo": {"full_name": "fresh3nough/react"}"#,
            r#""repo": null"#,
        );
        let pulls = parse_pulls(&format!("[{gone}]")).expect("разбирается");
        assert!(pulls[0].from_fork);
    }

    #[test]
    fn the_detail_keeps_the_markdown_body_and_the_labels() {
        let detail = parse_pull_detail(
            &PULL.replace(
                r#""number": 37184,"#,
                r###""number": 37184, "body": "## Summary\n- fix", "labels": [{"name": "CLA Signed"}], "changed_files": 3, "additions": 120, "deletions": 4,"###,
            ),
        )
        .expect("разбирается");
        assert_eq!(detail.body, "## Summary\n- fix");
        assert_eq!(detail.labels, vec!["CLA Signed"]);
        assert_eq!(detail.changed_files, 3);
    }

    #[test]
    fn an_empty_body_is_an_empty_string_not_a_crash() {
        let detail = parse_pull_detail(PULL).expect("разбирается");
        assert_eq!(detail.body, "");
    }

    #[test]
    fn comments_keep_their_author_and_time() {
        let comments = parse_comments(
            r#"[{"user": {"login": "react-sizebot", "avatar_url": "https://a/2"},
                "body": "Comparing: abc...def", "created_at": "2026-08-03T09:00:00Z"}]"#,
        )
        .expect("разбирается");
        assert_eq!(comments[0].author, "react-sizebot");
        assert_eq!(comments[0].created_at, "2026-08-03T09:00:00Z");
    }

    #[test]
    fn a_pull_lands_in_every_group_it_belongs_to() {
        let pulls = parse_pulls(&format!("[{PULL}]")).expect("разбирается");
        assert_eq!(
            groups_of(&pulls[0], "pr0d"),
            vec![Group::AwaitingMyReview],
            "я в requested_reviewers"
        );
        assert_eq!(groups_of(&pulls[0], "someone"), vec![Group::Assigned]);
        assert_eq!(groups_of(&pulls[0], "fresh3nough"), vec![Group::Mine]);
        assert!(groups_of(&pulls[0], "посторонний").is_empty());
    }

    #[test]
    fn a_vanished_pull_gets_its_own_code_instead_of_a_generic_failure() {
        let error = classify_pull_error(404, "Not Found");
        assert!(format!("{error:?}").contains("pull.gone"));
    }
}
