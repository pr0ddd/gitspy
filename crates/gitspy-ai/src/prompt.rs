pub struct Prompt {
    pub system: String,
    pub user: String,
}

const RULES: &str = "You write git commit messages from staged diffs. Respond with strict JSON only, no markdown, no code fences: {\"summary\": \"...\", \"description\": \"...\"}. The summary is in English, imperative mood, at most 72 characters, no trailing period; name the dominant change precisely - never a vague 'refactor code' or 'update files'. The description is 2 to 5 plain sentences and must carry information the summary does not. Its first sentence states the intent of the change - what the whole diff is driving at, not a file list. The following sentences name the concrete parts that changed (components, functions, settings) and say what behaves differently now. Never restate or paraphrase the summary in the description - a reader has both in front of them. No lists, no headers, no file-by-file enumeration. Use an empty description only for a trivial one-line change. The diff may be truncated; describe only what is visible.";

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
            "the diff goes into the user message"
        );
        assert!(
            prompt.system.contains("summary"),
            "the format rules go into the system message"
        );
        assert!(
            prompt.system.contains("72"),
            "the summary length limit is stated explicitly"
        );
        assert!(
            !prompt.system.contains("+new line"),
            "the diff does not leak into the system message"
        );
    }

    #[test]
    fn description_rules_forbid_echoing_the_summary() {
        let prompt = build_prompt("diff");
        assert!(
            prompt.system.contains("Never restate"),
            "the model duplicated the summary in the description until the ban was spelled out"
        );
        assert!(
            prompt.system.contains("2 to 5"),
            "the description is given a length: a single sentence degenerates into a retelling of the summary"
        );
        assert!(
            prompt.system.contains("first sentence states the intent"),
            "without an explicit demand the description dives into an enumeration and skips the point of the change"
        );
    }
}
