pub struct Prompt {
    pub system: String,
    pub user: String,
}

const RULES: &str = "You write git commit messages from staged diffs. Respond with strict JSON only, no markdown, no code fences: {\"summary\": \"...\", \"description\": \"...\"}. The summary is in English, imperative mood, at most 72 characters, no trailing period; name the dominant change precisely - never a vague 'refactor code' or 'update files'. The description is 2 to 5 plain sentences and must carry information the summary does not: name the concrete parts that changed (components, functions, settings), say what behaves differently now, and why the change was made when the diff makes it evident. Never restate or paraphrase the summary in the description - a reader has both in front of them. No lists, no headers, no file-by-file enumeration. Use an empty description only for a trivial one-line change. The diff may be truncated; describe only what is visible.";

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

    #[test]
    fn description_rules_forbid_echoing_the_summary() {
        let prompt = build_prompt("diff");
        assert!(
            prompt.system.contains("Never restate"),
            "модель дублировала заголовок в описание, пока запрет не назван прямо"
        );
        assert!(
            prompt.system.contains("2 to 5"),
            "описанию задан объём: одно предложение вырождается в пересказ заголовка"
        );
    }
}
