use crate::Error;
use serde::Deserialize;

pub const RELAY_URL: &str = "https://gitspy-oauth-relay.pavel-erohovets.workers.dev";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenSet {
    pub access: String,
    #[serde(default)]
    pub refresh: Option<String>,
    #[serde(default)]
    pub expires_in: Option<u64>,
}

pub fn parse_token_set(body: &str) -> Result<TokenSet, Error> {
    serde_json::from_str(body).map_err(|e| Error::Unexpected {
        status: 200,
        detail: e.to_string(),
    })
}

pub fn configured() -> Result<&'static str, Error> {
    if RELAY_URL.trim().is_empty() {
        return Err(Error::NoApplication);
    }
    Ok(RELAY_URL)
}

async fn ask(path: &str, body: serde_json::Value) -> Result<TokenSet, Error> {
    let base = configured()?;
    let client = reqwest::Client::builder()
        .user_agent("gitspy")
        .build()
        .map_err(|e| Error::Network {
            detail: e.to_string(),
        })?;
    let response = client
        .post(format!("{}{path}", base.trim_end_matches('/')))
        .json(&body)
        .send()
        .await
        .map_err(|e| Error::Network {
            detail: e.to_string(),
        })?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|e| Error::Network {
        detail: e.to_string(),
    })?;
    if status == 401 {
        return Err(Error::BadToken);
    }
    if status >= 400 {
        return Err(Error::Unexpected {
            status,
            detail: text,
        });
    }
    parse_token_set(&text)
}

pub async fn exchange(host: &str, code: &str) -> Result<TokenSet, Error> {
    ask(
        "/exchange",
        serde_json::json!({ "host": host, "code": code }),
    )
    .await
}

pub async fn refresh(host: &str, refresh: &str) -> Result<TokenSet, Error> {
    ask(
        "/refresh",
        serde_json::json!({ "host": host, "refresh": refresh }),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_token_set_reads_access_refresh_and_lifetime() {
        let set = parse_token_set(r#"{"access":"A","refresh":"R","expiresIn":7200}"#)
            .expect("токен-сет читается");
        assert_eq!(set.access, "A");
        assert_eq!(set.refresh.as_deref(), Some("R"));
        assert_eq!(set.expires_in, Some(7200));

        let bare = parse_token_set(r#"{"access":"A"}"#).expect("github живёт без refresh");
        assert_eq!(bare.refresh, None);
    }

    #[test]
    fn the_relay_is_configured_with_our_worker() {
        assert!(
            configured().expect("релей настроен").starts_with("https://"),
            "обмен кодов ходит только по https"
        );
    }
}
