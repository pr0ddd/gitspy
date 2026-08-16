#![forbid(unsafe_code)]

pub mod avatars;
pub const LOOPBACK_REDIRECT: &str = "http://127.0.0.1:53682/callback";

pub mod bitbucket;
pub mod github;
pub mod gitlab;
pub mod host;
pub mod pkce;
pub mod pulls;
pub mod relay;
pub mod remote;
pub mod secrets;
pub mod templates;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub host: String,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    NoToken,
    BadToken,
    NoApplication,
    Denied,
    Expired,
    RateLimited { resets_in: Option<u64> },
    Network { detail: String },
    Unexpected { status: u16, detail: String },
    Storage { detail: String },
}

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Error::NoToken => "host.noToken",
            Error::BadToken => "host.badToken",
            Error::NoApplication => "host.noApplication",
            Error::Denied => "host.denied",
            Error::Expired => "host.expired",
            Error::RateLimited { .. } => "host.rateLimited",
            Error::Network { .. } => "host.network",
            Error::Unexpected { .. } => "host.unexpected",
            Error::Storage { .. } => "host.storage",
        }
    }

    pub fn detail(&self) -> Option<String> {
        match self {
            Error::NoToken
            | Error::BadToken
            | Error::NoApplication
            | Error::Denied
            | Error::Expired => None,
            Error::RateLimited { resets_in } => resets_in.map(|s| format!("{s}s")),
            Error::Network { detail } | Error::Storage { detail } => Some(detail.clone()),
            Error::Unexpected { status, detail } => Some(format!("{status}: {detail}")),
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.detail() {
            Some(detail) => write!(f, "{}: {detail}", self.code()),
            None => write!(f, "{}", self.code()),
        }
    }
}

impl std::error::Error for Error {}

pub fn classify(status: u16, body: &str, retry_after: Option<u64>) -> Error {
    match status {
        401 => Error::BadToken,
        403 if body.contains("rate limit") => Error::RateLimited {
            resets_in: retry_after,
        },
        403 => Error::BadToken,
        429 => Error::RateLimited {
            resets_in: retry_after,
        },
        other => Error::Unexpected {
            status: other,
            detail: body.chars().take(200).collect(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_expired_token_is_told_apart_from_a_broken_network() {
        assert_eq!(classify(401, "Bad credentials", None), Error::BadToken);
        assert_ne!(
            classify(401, "Bad credentials", None),
            Error::Network {
                detail: String::new()
            }
        );
    }

    #[test]
    fn hitting_the_rate_limit_is_its_own_state_with_a_wait() {
        assert_eq!(
            classify(403, "API rate limit exceeded", Some(60)),
            Error::RateLimited {
                resets_in: Some(60)
            }
        );
    }

    #[test]
    fn a_forbidden_answer_without_a_rate_limit_means_the_token_lacks_rights() {
        assert_eq!(
            classify(403, "Resource not accessible", None),
            Error::BadToken
        );
    }

    #[test]
    fn an_unknown_answer_keeps_its_status_and_a_short_excerpt() {
        let error = classify(500, &"x".repeat(1000), None);
        match error {
            Error::Unexpected { status, detail } => {
                assert_eq!(status, 500);
                assert_eq!(
                    detail.len(),
                    200,
                    "the detail is cut short instead of dragging along kilobytes"
                );
            }
            other => panic!("expected Error::Unexpected, got {other:?}"),
        }
    }

    #[test]
    fn every_error_has_a_code_for_the_frontend() {
        for error in [
            Error::NoToken,
            Error::BadToken,
            Error::NoApplication,
            Error::Denied,
            Error::Expired,
            Error::RateLimited { resets_in: None },
            Error::Network { detail: "x".into() },
            Error::Unexpected {
                status: 500,
                detail: "x".into(),
            },
            Error::Storage { detail: "x".into() },
        ] {
            assert!(error.code().starts_with("host."), "{error:?}");
        }
    }
}
