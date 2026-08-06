use crate::pulls::{Comment, PullDetail, PullSummary};
use crate::{github, gitlab, Account, Error};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HostKind {
    GitHub,
    GitLab,
}

pub struct HostCredential {
    pub url: String,
    pub username: &'static str,
}

pub enum ConnectStart {
    DeviceCode {
        user_code: String,
        verification_uri: String,
    },
    BrowserAuth {
        url: String,
    },
    TokenForm {
        needs_base_url: bool,
    },
}

pub enum Host {
    GitHub(github::GitHub),
    GitLab(gitlab::GitLab),
}

impl Host {
    pub fn for_connection(kind: HostKind, base_url: &str) -> Result<Host, Error> {
        match kind {
            HostKind::GitHub => Ok(Host::GitHub(github::GitHub::new()?)),
            HostKind::GitLab => Ok(Host::GitLab(gitlab::GitLab::new(base_url)?)),
        }
    }

    pub fn credential(&self) -> HostCredential {
        match self {
            Host::GitHub(_) => HostCredential {
                url: "https://github.com".to_string(),
                username: "x-access-token",
            },
            Host::GitLab(gitlab) => HostCredential {
                url: gitlab.base_url().to_string(),
                username: "oauth2",
            },
        }
    }

    pub async fn account(&self, token: &str) -> Result<Account, Error> {
        match self {
            Host::GitHub(github) => github.account(token).await,
            Host::GitLab(gitlab) => gitlab.account(token).await,
        }
    }

    pub async fn repos(&self, token: &str, pages: u32) -> Result<Vec<github::Repo>, Error> {
        match self {
            Host::GitHub(github) => github.repos(token, pages).await,
            Host::GitLab(gitlab) => gitlab.repos(token, pages).await,
        }
    }

    pub async fn pulls(
        &self,
        token: &str,
        owner: &str,
        name: &str,
    ) -> Result<(Vec<PullSummary>, bool), Error> {
        match self {
            Host::GitHub(github) => github.pulls(token, owner, name).await,
            Host::GitLab(gitlab) => gitlab.pulls(token, owner, name).await.map(|found| (found, false)),
        }
    }

    pub async fn pull_detail(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        number: u64,
    ) -> Result<PullDetail, Error> {
        match self {
            Host::GitHub(github) => github.pull_detail(token, owner, name, number).await,
            Host::GitLab(gitlab) => gitlab.pull_detail(token, owner, name, number).await,
        }
    }

    pub async fn pull_comments(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        number: u64,
    ) -> Result<Vec<Comment>, Error> {
        match self {
            Host::GitHub(github) => github.pull_comments(token, owner, name, number).await,
            Host::GitLab(gitlab) => gitlab.pull_comments(token, owner, name, number).await,
        }
    }

    pub async fn commit_author(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        hash: &str,
    ) -> Option<(String, String)> {
        match self {
            Host::GitHub(github) => github.commit_author(token, owner, name, hash).await,
            Host::GitLab(gitlab) => gitlab.commit_author(token, owner, name, hash).await,
        }
    }

    pub async fn commit_avatars(
        &self,
        token: &str,
        owner: &str,
        name: &str,
        pages: u32,
    ) -> Result<Vec<(String, String)>, Error> {
        match self {
            Host::GitHub(github) => github.commit_avatars(token, owner, name, pages).await,
            Host::GitLab(gitlab) => gitlab.commit_avatars(token, owner, name, pages).await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_kind_builds_its_provider_and_credential() {
        let github = Host::for_connection(HostKind::GitHub, "https://github.com")
            .expect("github строится");
        let cred = github.credential();
        assert_eq!(cred.username, "x-access-token");
        assert_eq!(cred.url, "https://github.com");

        let gitlab = Host::for_connection(HostKind::GitLab, "https://git.corp.dev/")
            .expect("gitlab строится");
        let cred = gitlab.credential();
        assert_eq!(
            cred.username, "oauth2",
            "у каждого провайдера своё имя пользователя для https-операций"
        );
        assert_eq!(
            cred.url, "https://git.corp.dev",
            "self-hosted несёт свой base_url в кред-хелпер"
        );
    }
}
