pub fn service_avatar(email: &str) -> Option<String> {
    let email = email.trim().to_lowercase();
    let (local, domain) = email.split_once('@')?;

    match domain {
        "users.noreply.github.com" => {
            let by_id = local
                .split_once('+')
                .and_then(|(id, _)| id.parse::<u64>().ok())
                .map(|id| format!("https://avatars.githubusercontent.com/u/{id}?s=64"));
            Some(
                by_id.unwrap_or_else(|| {
                    format!("https://avatars.githubusercontent.com/{local}?s=64")
                }),
            )
        }
        "users.noreply.gitlab.com" => {
            let (id, _) = local.split_once('-')?;
            let id: u64 = id.parse().ok()?;
            Some(format!(
                "https://gitlab.com/uploads/-/system/user/avatar/{id}/avatar.png?width=64"
            ))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_github_noreply_forms_give_a_picture_without_a_token() {
        assert_eq!(
            service_avatar("12345+pr0ddd@users.noreply.github.com").as_deref(),
            Some("https://avatars.githubusercontent.com/u/12345?s=64"),
            "the new form carries the numeric id — the picture comes from arithmetic"
        );
        assert_eq!(
            service_avatar("pr0ddd@users.noreply.github.com").as_deref(),
            Some("https://avatars.githubusercontent.com/pr0ddd?s=64"),
            "the old form carries only the login"
        );
    }

    #[test]
    fn the_gitlab_noreply_form_belongs_to_gitlab_not_github() {
        assert_eq!(
            service_avatar("777-someone@users.noreply.gitlab.com").as_deref(),
            Some("https://gitlab.com/uploads/-/system/user/avatar/777/avatar.png?width=64")
        );
    }

    #[test]
    fn an_ordinary_email_is_not_guessed_at() {
        assert_eq!(service_avatar("pavel@example.com"), None);
        assert_eq!(service_avatar("no-at-sign"), None);
    }

    #[test]
    fn the_case_of_an_email_does_not_matter() {
        assert_eq!(
            service_avatar("12345+PR0DDD@Users.Noreply.GitHub.com"),
            service_avatar("12345+pr0ddd@users.noreply.github.com")
        );
    }
}
