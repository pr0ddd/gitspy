use crate::prompt::Prompt;
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiProvider {
    Ollama,
    LmStudio,
}

impl AiProvider {
    pub fn id(&self) -> &'static str {
        match self {
            Self::Ollama => "ollama",
            Self::LmStudio => "lmstudio",
        }
    }
}

pub fn chat_url(base_url: &str) -> String {
    format!("{}/v1/chat/completions", base_url.trim_end_matches('/'))
}

pub fn models_url(base_url: &str) -> String {
    format!("{}/v1/models", base_url.trim_end_matches('/'))
}

pub fn version_url(base_url: &str) -> String {
    format!("{}/api/version", base_url.trim_end_matches('/'))
}

pub fn chat_models(models: Vec<String>) -> Vec<String> {
    models
        .into_iter()
        .filter(|name| !name.to_lowercase().contains("embed"))
        .collect()
}

pub fn chat_body(model: &str, prompt: &Prompt) -> Value {
    json!({
        "model": model,
        "messages": [
            { "role": "system", "content": prompt.system },
            { "role": "user", "content": prompt.user }
        ],
        "stream": false,
        "temperature": 0.2,
        "response_format": response_format(),
    })
}

fn response_format() -> Value {
    json!({
        "type": "json_schema",
        "json_schema": {
            "name": "commit_draft",
            "strict": true,
            "schema": {
                "type": "object",
                "properties": {
                    "summary": { "type": "string" },
                    "description": { "type": "string" }
                },
                "required": ["summary", "description"]
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prompt::build_prompt;

    #[test]
    fn ids_name_the_provider_for_the_frontend() {
        assert_eq!(
            AiProvider::Ollama.id(),
            "ollama",
            "the id is the contract with the frontend"
        );
        assert_eq!(
            AiProvider::LmStudio.id(),
            "lmstudio",
            "the id is the contract with the frontend"
        );
    }

    #[test]
    fn urls_tolerate_trailing_slash() {
        assert_eq!(
            chat_url("http://hulk:1234/"),
            "http://hulk:1234/v1/chat/completions",
            "a trailing slash in the base URL is not doubled"
        );
        assert_eq!(
            models_url("http://localhost:11434"),
            "http://localhost:11434/v1/models"
        );
    }

    #[test]
    fn chat_body_carries_model_and_both_messages() {
        let body = chat_body("qwen2.5-coder", &build_prompt("diff"));
        assert_eq!(
            body["model"], "qwen2.5-coder",
            "the model name is sent as is"
        );
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["role"], "user");
        assert_eq!(
            body["stream"], false,
            "streaming is off: the reply is parsed as a whole"
        );
    }

    #[test]
    fn response_format_is_a_json_schema_for_everyone() {
        let body = chat_body("m", &build_prompt("diff"));
        assert_eq!(
            body["response_format"]["type"], "json_schema",
            "recent Ollama accepts only json_schema or text, and LM Studio understands the schema as well"
        );
        assert_eq!(
            body["response_format"]["json_schema"]["schema"]["required"],
            serde_json::json!(["summary", "description"]),
            "the schema requires both fields"
        );
    }
}

#[cfg(test)]
mod detect_tests {
    use super::*;

    #[test]
    fn version_url_is_ollama_only_probe() {
        assert_eq!(
            version_url("http://hulk:1234/"),
            "http://hulk:1234/api/version",
            "the probe hits an endpoint that only Ollama has"
        );
    }

    #[test]
    fn embedding_models_are_not_offered_for_commits() {
        let all = vec![
            "google/gemma-4-12b-qat".to_string(),
            "text-embedding-nomic-embed-text-v1.5".to_string(),
            "qwen/qwen3.6-27b".to_string(),
        ];
        assert_eq!(
            chat_models(all),
            vec![
                "google/gemma-4-12b-qat".to_string(),
                "qwen/qwen3.6-27b".to_string()
            ],
            "an embedding model does not write text, so it has no place in the list"
        );
    }
}
