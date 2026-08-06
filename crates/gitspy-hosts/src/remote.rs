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

fn host_of_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if let Some(rest) = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .or_else(|| trimmed.strip_prefix("ssh://"))
    {
        let authority = rest.split('/').next()?;
        let host = authority.rsplit('@').next()?;
        return Some(host.split(':').next()?.to_lowercase());
    }
    if let Some(rest) = trimmed.split_once('@').map(|(_, tail)| tail) {
        return Some(rest.split(':').next()?.to_lowercase());
    }
    None
}

fn repo_path_of(url: &str) -> Option<(String, String)> {
    let trimmed = url.trim();
    let tail = if let Some((_, after)) = trimmed.split_once("://") {
        after.split_once('/')?.1
    } else if let Some((_, after)) = trimmed.split_once('@') {
        after.split_once(':')?.1
    } else {
        return None;
    };

    let mut parts = tail.trim_matches('/').splitn(2, '/');
    let owner = parts.next()?.trim();
    let repo = parts.next()?.trim().trim_end_matches(".git");
    if owner.is_empty() || repo.is_empty() || repo.contains('/') {
        return None;
    }
    Some((owner.to_string(), repo.to_string()))
}

pub fn matches_remote(
    remotes: &[(String, String)],
    base_url: &str,
) -> Option<(String, String)> {
    let wanted = host_of_url(base_url)?;
    let fits = |url: &str| host_of_url(url).as_deref() == Some(wanted.as_str());

    let origin = remotes
        .iter()
        .find(|(name, url)| name == "origin" && fits(url));
    origin
        .or_else(|| remotes.iter().find(|(_, url)| fits(url)))
        .and_then(|(_, url)| repo_path_of(url))
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
    fn matches_remote_pairs_a_connection_host_with_its_remotes() {
        let remotes = vec![
            ("upstream".to_string(), "git@gitlab.com:group/tool.git".to_string()),
            ("origin".to_string(), "https://gitlab.com/me/tool.git".to_string()),
        ];
        assert_eq!(
            matches_remote(&remotes, "https://gitlab.com"),
            Some(("me".to_string(), "tool".to_string())),
            "origin выигрывает у прочих remote того же хоста"
        );
        assert_eq!(
            matches_remote(&remotes, "https://git.corp.dev"),
            None,
            "чужой инстанс не подгоняется под ближайший похожий"
        );
        assert_eq!(
            matches_remote(
                &[("origin".into(), "ssh://git@git.corp.dev:2222/team/app.git".into())],
                "https://git.corp.dev",
            ),
            Some(("team".to_string(), "app".to_string())),
            "self-hosted с портом в ssh-форме — тот же хост"
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
