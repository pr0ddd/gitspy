pub const CLAUDE_ENV: &str = "CLAUDE_CODE_EXECUTABLE";

const CANDIDATES: [&str; 3] = [
    "{home}/.local/bin/claude",
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
];

pub fn resolve_claude(
    env: &dyn Fn(&str) -> Option<String>,
    exists: &dyn Fn(&str) -> bool,
) -> Option<String> {
    if let Some(path) = env(CLAUDE_ENV) {
        if exists(&path) {
            return Some(path);
        }
    }
    let home = env("HOME").unwrap_or_default();
    CANDIDATES
        .iter()
        .map(|c| c.replace("{home}", &home))
        .find(|path| exists(path))
}

pub fn claude_code_env() -> Vec<(String, String)> {
    let found = resolve_claude(&|name| std::env::var(name).ok(), &|path| {
        std::path::Path::new(path).is_file()
    });
    match found {
        Some(path) => vec![(CLAUDE_ENV.to_owned(), path)],
        None => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_variable_wins_when_file_exists() {
        let found = resolve_claude(
            &|n| (n == CLAUDE_ENV).then(|| "/x/claude".to_owned()),
            &|p| p == "/x/claude",
        );
        assert_eq!(
            found.as_deref(),
            Some("/x/claude"),
            "выставленная пользователем переменная уважается"
        );
    }

    #[test]
    fn broken_variable_falls_back_to_candidates() {
        let found = resolve_claude(
            &|n| match n {
                CLAUDE_ENV => Some("/gone/claude".to_owned()),
                "HOME" => Some("/Users/u".to_owned()),
                _ => None,
            },
            &|p| p == "/Users/u/.local/bin/claude",
        );
        assert_eq!(
            found.as_deref(),
            Some("/Users/u/.local/bin/claude"),
            "битая переменная не мешает найти кандидата через HOME"
        );
    }

    #[test]
    fn nothing_found_gives_none() {
        let found = resolve_claude(&|_| None, &|_| false);
        assert_eq!(found, None, "без бинаря переменную ставить не из чего");
    }
}
