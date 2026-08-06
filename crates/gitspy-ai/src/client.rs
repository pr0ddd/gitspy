use crate::parse::{parse_draft, CommitDraft};
use crate::prompt::build_prompt;
use crate::provider::{chat_body, chat_url, models_url, AiProvider};
use crate::trim::trim_diff;
use serde::Deserialize;
use std::time::Duration;

const LIST_TIMEOUT: Duration = Duration::from_secs(10);
const GENERATE_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug)]
pub enum AiError {
    Unreachable { detail: String },
    BadResponse { detail: String },
}

impl AiError {
    pub fn code(&self) -> &'static str {
        match self {
            AiError::Unreachable { .. } => "ai.unreachable",
            AiError::BadResponse { .. } => "ai.badResponse",
        }
    }

    pub fn detail(&self) -> String {
        match self {
            AiError::Unreachable { detail } | AiError::BadResponse { detail } => detail.clone(),
        }
    }
}

#[derive(Deserialize)]
struct ModelList {
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
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

async fn read_ok(response: reqwest::Response) -> Result<String, AiError> {
    let status = response.status();
    let text = response.text().await.map_err(unreachable)?;
    if !status.is_success() {
        return Err(AiError::Unreachable {
            detail: format!("{status}: {text}"),
        });
    }
    Ok(text)
}

pub async fn list_models(provider: AiProvider, base_url: &str) -> Result<Vec<String>, AiError> {
    let _ = provider;
    let client = reqwest::Client::builder()
        .timeout(LIST_TIMEOUT)
        .build()
        .map_err(unreachable)?;
    let response = client
        .get(models_url(base_url))
        .send()
        .await
        .map_err(unreachable)?;
    let text = read_ok(response).await?;
    let list: ModelList = serde_json::from_str(&text).map_err(|e| AiError::BadResponse {
        detail: format!("{e}: {text}"),
    })?;
    Ok(list.data.into_iter().map(|entry| entry.id).collect())
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
    let text = read_ok(response).await?;
    let reply: ChatReply = serde_json::from_str(&text).map_err(|e| AiError::BadResponse {
        detail: format!("{e}: {text}"),
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
