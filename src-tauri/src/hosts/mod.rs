mod catalog;
mod connect;
mod connections;
mod credentials;
pub mod loopback;
mod pulls;
pub mod storage;

pub use catalog::*;
pub use connect::*;
pub use connections::*;
pub use credentials::*;
pub use pulls::*;

use crate::views::ErrorView;
use gitspy_hosts::github::Repo;
use gitspy_hosts::host::{Host, HostKind};
use gitspy_hosts::{bitbucket, Account};
use std::collections::HashMap;
use std::sync::Mutex;
use storage::Connection;

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

pub(crate) fn known_def(host: &str) -> Result<(HostKind, &'static str), ErrorView> {
    match host {
        "github" => Ok((HostKind::GitHub, "https://github.com")),
        "gitlab" => Ok((HostKind::GitLab, "https://gitlab.com")),
        "bitbucket" => Ok((HostKind::Bitbucket, bitbucket::BASE_URL)),
        other => Err(ErrorView::new("host.unknown").param("host", other)),
    }
}

pub(crate) fn host_for(connection: &Connection) -> Result<Host, ErrorView> {
    Host::for_connection(connection.kind, &connection.base_url).map_err(host_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_token_counts_as_stale_a_minute_before_it_expires() {
        assert!(!access_is_stale(Some(2_000), false, 1_000));
        assert!(
            access_is_stale(Some(1_050), false, 1_000),
            "a request in flight must not cross the expiry: refresh a minute early"
        );
        assert!(access_is_stale(Some(900), false, 1_000));
    }

    #[test]
    fn a_token_of_unknown_lifetime_is_refreshed_when_it_can_be_and_trusted_when_it_cannot() {
        assert!(
            access_is_stale(None, true, 1_000),
            "tokens stored before lifetimes were kept: one refresh tells us the real expiry"
        );
        assert!(
            !access_is_stale(None, false, 1_000),
            "a classic GitHub token has no lifetime and no refresh; only the host can reject it"
        );
    }

    #[test]
    fn a_second_press_reuses_the_same_browser_url() {
        let hosts = Hosts::default();
        hosts.browse_for("gitlab", "https://gitlab.com/oauth/x".into());
        assert_eq!(
            hosts.already_browsing("gitlab").as_deref(),
            Some("https://gitlab.com/oauth/x"),
            "pressing again must not spawn more listeners and browser tabs"
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
            "a list left behind would show someone else's repositories after the account changes"
        );
    }

    #[test]
    fn an_unknown_host_is_refused_before_any_request() {
        assert!(known_def("trello").is_err());
        assert!(known_def("github").is_ok());
        assert!(
            known_def("gitlab").is_ok(),
            "gitlab is a full provider, not a special case"
        );
    }
}
