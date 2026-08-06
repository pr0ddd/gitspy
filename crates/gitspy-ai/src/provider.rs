use crate::prompt::Prompt;
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiProvider {
    Ollama,
    LmStudio,
}

impl AiProvider {
    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "ollama" => Some(Self::Ollama),
            "lmstudio" => Some(Self::LmStudio),
            _ => None,
        }
    }

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

pub fn chat_body(provider: AiProvider, model: &str, prompt: &Prompt) -> Value {
    json!({
        "model": model,
        "messages": [
            { "role": "system", "content": prompt.system },
            { "role": "user", "content": prompt.user }
        ],
        "stream": false,
        "temperature": 0.2,
        "response_format": response_format(provider),
    })
}

fn response_format(provider: AiProvider) -> Value {
    match provider {
        AiProvider::Ollama => json!({ "type": "json_object" }),
        AiProvider::LmStudio => json!({
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
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prompt::build_prompt;

    #[test]
    fn ids_round_trip() {
        assert_eq!(
            AiProvider::from_id("ollama"),
            Some(AiProvider::Ollama),
            "ollama узнаётся по id"
        );
        assert_eq!(
            AiProvider::from_id("lmstudio"),
            Some(AiProvider::LmStudio),
            "lmstudio узнаётся по id"
        );
        assert_eq!(
            AiProvider::from_id("openai"),
            None,
            "чужой id — отказ, не паника"
        );
    }

    #[test]
    fn urls_tolerate_trailing_slash() {
        assert_eq!(
            chat_url("http://hulk:1234/"),
            "http://hulk:1234/v1/chat/completions",
            "хвостовой слэш адреса не удваивается"
        );
        assert_eq!(
            models_url("http://localhost:11434"),
            "http://localhost:11434/v1/models"
        );
    }

    #[test]
    fn chat_body_carries_model_and_both_messages() {
        let body = chat_body(AiProvider::Ollama, "qwen2.5-coder", &build_prompt("diff"));
        assert_eq!(body["model"], "qwen2.5-coder", "имя модели уходит как есть");
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["role"], "user");
        assert_eq!(
            body["stream"], false,
            "стриминг выключен: ответ разбирается целиком"
        );
    }

    #[test]
    fn response_format_differs_per_provider() {
        let prompt = build_prompt("diff");
        let ollama = chat_body(AiProvider::Ollama, "m", &prompt);
        let lmstudio = chat_body(AiProvider::LmStudio, "m", &prompt);
        assert_eq!(
            ollama["response_format"]["type"], "json_object",
            "Ollama понимает json_object"
        );
        assert_eq!(
            lmstudio["response_format"]["type"], "json_schema",
            "LM Studio строже: полная json-схема"
        );
        assert_eq!(
            lmstudio["response_format"]["json_schema"]["schema"]["required"],
            serde_json::json!(["summary", "description"]),
            "схема требует оба поля"
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
            "зонд бьёт в эндпоинт, который есть только у Ollama"
        );
    }

    #[test]
    fn ids_survive_round_trip_through_id() {
        assert_eq!(
            AiProvider::from_id(AiProvider::Ollama.id()),
            Some(AiProvider::Ollama),
            "id обязан разбираться обратно в тот же провайдер"
        );
        assert_eq!(
            AiProvider::from_id(AiProvider::LmStudio.id()),
            Some(AiProvider::LmStudio),
            "id обязан разбираться обратно в тот же провайдер"
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
            "embedding-модель не пишет текст — ей не место в списке"
        );
    }
}
