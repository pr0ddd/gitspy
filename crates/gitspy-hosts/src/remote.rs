pub fn github_repo(url: &str) -> Option<(String, String)> {
    let trimmed = url.trim();

    let tail = trimmed
        .strip_prefix("https://github.com/")
        .or_else(|| trimmed.strip_prefix("http://github.com/"))
        .or_else(|| trimmed.strip_prefix("git@github.com:"))
        .or_else(|| trimmed.strip_prefix("ssh://git@github.com/"))?;

    let mut parts = tail.trim_matches('/').splitn(2, '/');
    let owner = parts.next()?.trim();
    let repo = parts.next()?.trim().trim_end_matches(".git");

    if owner.is_empty() || repo.is_empty() || repo.contains('/') {
        return None;
    }
    Some((owner.to_string(), repo.to_string()))
}

pub fn preferred_github_remote(remotes: &[(String, String)]) -> Option<(String, String)> {
    let origin = remotes
        .iter()
        .find(|(name, url)| name == "origin" && github_repo(url).is_some());

    origin
        .or_else(|| remotes.iter().find(|(_, url)| github_repo(url).is_some()))
        .and_then(|(_, url)| github_repo(url))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_three_address_forms_name_the_same_repository() {
        for url in [
            "https://github.com/pr0ddd/gitspy.git",
            "git@github.com:pr0ddd/gitspy.git",
            "ssh://git@github.com/pr0ddd/gitspy",
        ] {
            assert_eq!(
                github_repo(url),
                Some(("pr0ddd".to_string(), "gitspy".to_string())),
                "{url}"
            );
        }
    }

    #[test]
    fn the_git_suffix_is_optional() {
        assert_eq!(
            github_repo("https://github.com/facebook/react"),
            Some(("facebook".to_string(), "react".to_string()))
        );
    }

    #[test]
    fn other_hosts_are_not_guessed_at() {
        assert_eq!(github_repo("https://gitlab.com/owner/repo.git"), None);
        assert_eq!(github_repo("git@bitbucket.org:owner/repo.git"), None);
        assert_eq!(github_repo("/home/user/local/repo"), None);
    }

    #[test]
    fn a_mangled_address_is_refused_rather_than_split_blindly() {
        assert_eq!(github_repo("https://github.com/"), None);
        assert_eq!(github_repo("https://github.com/only-owner"), None);
        assert_eq!(github_repo("git@github.com:a/b/c.git"), None);
    }

    #[test]
    fn origin_wins_even_when_it_is_listed_last() {
        let remotes = vec![
            (
                "backup".to_string(),
                "git@github.com:someone/fork.git".to_string(),
            ),
            (
                "origin".to_string(),
                "git@github.com:pr0ddd/gitspy.git".to_string(),
            ),
        ];
        assert_eq!(
            preferred_github_remote(&remotes),
            Some(("pr0ddd".to_string(), "gitspy".to_string())),
            "иначе PR придут из чужого форка, а не из основного репозитория"
        );
    }

    #[test]
    fn an_origin_outside_github_yields_to_a_github_remote() {
        let remotes = vec![
            (
                "origin".to_string(),
                "git@gitlab.com:mirror/repo.git".to_string(),
            ),
            (
                "github".to_string(),
                "https://github.com/pr0ddd/gitspy.git".to_string(),
            ),
        ];
        assert_eq!(
            preferred_github_remote(&remotes),
            Some(("pr0ddd".to_string(), "gitspy".to_string()))
        );
    }

    #[test]
    fn a_repository_without_github_says_so() {
        let remotes = vec![(
            "origin".to_string(),
            "git@gitlab.com:mirror/repo.git".to_string(),
        )];
        assert_eq!(preferred_github_remote(&remotes), None);
    }
}
