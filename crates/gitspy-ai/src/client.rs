use crate::parse::{parse_draft, CommitDraft};
use crate::prompt::build_prompt;
use crate::provider::{chat_body, chat_models, chat_url, models_url, version_url, AiProvider};
use crate::trim::trim_diff;
use serde::Deserialize;
use std::time::Duration;

const LIST_TIMEOUT: Duration = Duration::from_secs(10);
const GENERATE_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug)]
pub enum AiError {
    Unreachable { detail: String },
    Refused { detail: String },
    ModelMissing { model: String, detail: String },
    BadServer { detail: String },
    BadResponse { detail: String },
}

impl AiError {
    pub fn code(&self) -> &'static str {
        match self {
            AiError::Unreachable { .. } => "ai.unreachable",
            AiError::Refused { .. } => "ai.refused",
            AiError::ModelMissing { .. } => "ai.modelMissing",
            AiError::BadServer { .. } => "ai.badServer",
            AiError::BadResponse { .. } => "ai.badResponse",
        }
    }

    pub fn detail(&self) -> String {
        match self {
            AiError::Unreachable { detail }
            | AiError::Refused { detail }
            | AiError::ModelMissing { detail, .. }
            | AiError::BadServer { detail }
            | AiError::BadResponse { detail } => detail.clone(),
        }
    }
}

#[derive(Deserialize)]
struct ErrorEnvelope {
    error: ErrorBody,
}

#[derive(Deserialize)]
struct ErrorBody {
    message: String,
}

fn server_said(body: &str) -> Option<String> {
    serde_json::from_str::<ErrorEnvelope>(body)
        .ok()
        .map(|envelope| envelope.error.message)
}

fn reply_error(status: u16, body: &str, model: Option<&str>) -> AiError {
    let said = server_said(body).unwrap_or_else(|| body.to_string());
    if let Some(model) = model {
        if said.contains(model) && said.contains("not found") {
            return AiError::ModelMissing {
                model: model.to_string(),
                detail: said,
            };
        }
    }
    AiError::Refused {
        detail: format!("{status}: {said}"),
    }
}

#[derive(Deserialize)]
struct ModelList {
    #[serde(default)]
    data: Option<Vec<ModelEntry>>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
}

fn parse_model_list(text: &str) -> Result<Vec<String>, AiError> {
    let list: ModelList = serde_json::from_str(text).map_err(|_| AiError::BadServer {
        detail: text.to_string(),
    })?;
    Ok(list
        .data
        .unwrap_or_default()
        .into_iter()
        .map(|entry| entry.id)
        .collect())
}

#[derive(Deserialize)]
struct ChatReply {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(Deserialize)]
struct ChoiceMessage {
    content: String,
}

fn unreachable(error: reqwest::Error) -> AiError {
    AiError::Unreachable {
        detail: error.to_string(),
    }
}

async fn read_ok(response: reqwest::Response, model: Option<&str>) -> Result<String, AiError> {
    let status = response.status();
    let text = response.text().await.map_err(unreachable)?;
    if !status.is_success() {
        return Err(reply_error(status.as_u16(), &text, model));
    }
    Ok(text)
}

pub struct AiServer {
    pub provider: AiProvider,
    pub models: Vec<String>,
}

pub async fn detect_server(base_url: &str) -> Result<AiServer, AiError> {
    let client = reqwest::Client::builder()
        .timeout(LIST_TIMEOUT)
        .build()
        .map_err(unreachable)?;
    let response = client
        .get(models_url(base_url))
        .send()
        .await
        .map_err(unreachable)?;
    let text = read_ok(response, None).await?;
    let models = parse_model_list(&text)?;
    let provider = match client.get(version_url(base_url)).send().await {
        Ok(probe) if probe.status().is_success() => AiProvider::Ollama,
        _ => AiProvider::LmStudio,
    };
    Ok(AiServer {
        provider,
        models: chat_models(models),
    })
}

pub async fn generate_commit(
    provider: AiProvider,
    base_url: &str,
    model: &str,
    diff: &str,
) -> Result<CommitDraft, AiError> {
    let prompt = build_prompt(&trim_diff(diff));
    let client = reqwest::Client::builder()
        .timeout(GENERATE_TIMEOUT)
        .build()
        .map_err(unreachable)?;
    let response = client
        .post(chat_url(base_url))
        .json(&chat_body(provider, model, &prompt))
        .send()
        .await
        .map_err(unreachable)?;
    let text = read_ok(response, Some(model)).await?;
    let reply: ChatReply = serde_json::from_str(&text).map_err(|_| AiError::BadServer {
        detail: text.clone(),
    })?;
    let content = reply
        .choices
        .first()
        .map(|choice| choice.message.content.as_str())
        .unwrap_or("");
    parse_draft(content).ok_or_else(|| AiError::BadResponse {
        detail: content.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_ollama_serializes_models_as_null_and_that_is_not_an_error() {
        let models = parse_model_list(r#"{"object":"list","data":null}"#)
            .expect("null вместо списка — это пустой сервер, а не поломка");
        assert!(models.is_empty(), "моделей нет, но разбор цел");
    }

    #[test]
    fn missing_data_field_is_also_an_empty_server() {
        let models = parse_model_list(r#"{"object":"list"}"#)
            .expect("отсутствие поля — тот же пустой сервер");
        assert!(models.is_empty(), "моделей нет, но разбор цел");
    }

    #[test]
    fn missing_model_is_named_not_blamed_on_the_network() {
        let body = r#"{"error":{"message":"model 'google/gemma-4-12b-qat' not found","type":"not_found_error","param":null,"code":null}}"#;
        let error = reply_error(404, body, Some("google/gemma-4-12b-qat"));
        assert_eq!(
            error.code(),
            "ai.modelMissing",
            "сервер жив и назвал причину — это не «не достучались»"
        );
        assert_eq!(
            error.detail(),
            "model 'google/gemma-4-12b-qat' not found",
            "в подробность идёт фраза сервера, а не JSON-конверт"
        );
    }

    #[test]
    fn other_rejections_carry_the_extracted_message() {
        let body = r#"{"error":{"message":"context length exceeded","type":"invalid_request_error","param":null,"code":null}}"#;
        let error = reply_error(400, body, Some("gemma"));
        assert_eq!(
            error.code(),
            "ai.refused",
            "отказ сервера — свой код, не сеть"
        );
        assert_eq!(
            error.detail(),
            "400: context length exceeded",
            "подробность — статус и фраза сервера без конверта"
        );
    }

    #[test]
    fn non_json_rejection_keeps_the_raw_body_in_detail() {
        let error = reply_error(502, "Bad Gateway", None);
        assert_eq!(
            error.code(),
            "ai.refused",
            "и без JSON это отказ, а не поломка разбора"
        );
        assert_eq!(error.detail(), "502: Bad Gateway");
    }

    #[test]
    fn alien_reply_names_the_server_not_the_model() {
        let error = parse_model_list("<html>404</html>").expect_err("не-JSON — ошибка сервера");
        assert_eq!(
            error.code(),
            "ai.badServer",
            "чужой ответ сервера — не про качество ответа модели"
        );
        assert_eq!(
            error.detail(),
            "<html>404</html>",
            "в подробность идёт тело ответа, без серде-жаргона"
        );
    }
}
