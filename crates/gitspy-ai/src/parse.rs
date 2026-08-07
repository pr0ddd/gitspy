use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct CommitDraft {
    pub summary: String,
    #[serde(default)]
    pub description: String,
}

pub fn parse_draft(text: &str) -> Option<CommitDraft> {
    let candidate = braced_slice(text)?;
    let draft: CommitDraft = serde_json::from_str(candidate).ok()?;
    let summary = draft.summary.trim();
    if summary.is_empty() {
        return None;
    }
    Some(CommitDraft {
        summary: summary.to_string(),
        description: draft.description.trim().to_string(),
    })
}

fn braced_slice(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end < start {
        return None;
    }
    Some(&text[start..=end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_json_parses() {
        let draft = parse_draft(
            r#"{"summary": "Fix lane collapse", "description": "The layout dropped merges."}"#,
        )
        .expect("чистый JSON разбирается");
        assert_eq!(draft.summary, "Fix lane collapse");
        assert_eq!(draft.description, "The layout dropped merges.");
    }

    #[test]
    fn json_inside_code_fence_parses() {
        let text = "```json\n{\"summary\": \"Add tests\", \"description\": \"\"}\n```";
        let draft = parse_draft(text).expect("JSON в код-фенсах разбирается");
        assert_eq!(draft.summary, "Add tests");
    }

    #[test]
    fn json_with_chatter_around_parses() {
        let text = "Here is your commit message:\n{\"summary\": \"Rename module\", \"description\": \"Old name lied.\"}\nHope it helps!";
        let draft = parse_draft(text).expect("болтовня вокруг JSON не мешает");
        assert_eq!(draft.summary, "Rename module");
    }

    #[test]
    fn missing_description_defaults_to_empty() {
        let draft = parse_draft(r#"{"summary": "Bump version"}"#).expect("описание опционально");
        assert_eq!(draft.description, "");
    }

    #[test]
    fn garbage_is_rejected() {
        assert!(
            parse_draft("I cannot help with that.").is_none(),
            "не-JSON — отказ, не паника"
        );
    }

    #[test]
    fn empty_summary_is_rejected() {
        assert!(
            parse_draft(r#"{"summary": "  ", "description": "x"}"#).is_none(),
            "пустой заголовок — это не сообщение коммита"
        );
    }
}
