pub struct Prompt {
    pub system: String,
    pub user: String,
}

const RULES: &str = "You write git commit messages from staged diffs. Respond with strict JSON only, no markdown, no code fences: {\"summary\": \"...\", \"description\": \"...\"}. The summary is in English, imperative mood, at most 72 characters, no trailing period, and states what the change does. The description is one to four plain sentences explaining what changed and why; use an empty string when the change is self-evident. Describe only what the diff shows.";

pub fn build_prompt(diff: &str) -> Prompt {
    Prompt {
        system: RULES.to_string(),
        user: format!("Staged diff:\n\n{diff}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_goes_to_user_message_rules_to_system() {
        let prompt = build_prompt("diff --git a/x b/x\n+new line\n");
        assert!(
            prompt.user.contains("+new line"),
            "дифф лежит в пользовательском сообщении"
        );
        assert!(
            prompt.system.contains("summary"),
            "правила формата лежат в системном"
        );
        assert!(
            prompt.system.contains("72"),
            "лимит длины заголовка назван явно"
        );
        assert!(
            !prompt.system.contains("+new line"),
            "дифф в системное сообщение не течёт"
        );
    }
}
