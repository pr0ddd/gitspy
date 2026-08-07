use crate::Error;
use serde::Deserialize;

fn unexpected(detail: impl ToString) -> Error {
    Error::Unexpected {
        status: 200,
        detail: detail.to_string(),
    }
}

pub fn parse_gitignore_names(body: &str) -> Result<Vec<String>, Error> {
    serde_json::from_str(body).map_err(unexpected)
}

#[derive(Debug, Deserialize)]
struct WireGitignore {
    source: String,
}

pub fn parse_gitignore_source(body: &str) -> Result<String, Error> {
    let wire: WireGitignore = serde_json::from_str(body).map_err(unexpected)?;
    Ok(wire.source)
}

#[derive(Debug, Deserialize)]
pub struct License {
    pub key: String,
    pub name: String,
}

pub fn parse_licenses(body: &str) -> Result<Vec<License>, Error> {
    serde_json::from_str(body).map_err(unexpected)
}

#[derive(Debug, Deserialize)]
struct WireLicenseBody {
    body: String,
}

pub fn parse_license_body(body: &str) -> Result<String, Error> {
    let wire: WireLicenseBody = serde_json::from_str(body).map_err(unexpected)?;
    Ok(wire.body)
}

pub struct Templates {
    client: reqwest::Client,
}

impl Templates {
    pub fn new() -> Result<Self, Error> {
        let client = reqwest::Client::builder()
            .user_agent("gitspy")
            .build()
            .map_err(|e| Error::Network {
                detail: e.to_string(),
            })?;
        Ok(Self { client })
    }

    async fn fetch(&self, url: &str, token: Option<&str>) -> Result<String, Error> {
        let mut request = self
            .client
            .get(url)
            .header("Accept", "application/vnd.github+json");
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        let response = request.send().await.map_err(|e| Error::Network {
            detail: e.to_string(),
        })?;
        let status = response.status().as_u16();
        let body = response.text().await.map_err(|e| Error::Network {
            detail: e.to_string(),
        })?;
        if status >= 400 {
            return Err(crate::classify(status, &body, None));
        }
        Ok(body)
    }

    pub async fn gitignore_names(&self, token: Option<&str>) -> Result<Vec<String>, Error> {
        parse_gitignore_names(
            &self
                .fetch("https://api.github.com/gitignore/templates", token)
                .await?,
        )
    }

    pub async fn gitignore_source(&self, name: &str, token: Option<&str>) -> Result<String, Error> {
        parse_gitignore_source(
            &self
                .fetch(
                    &format!("https://api.github.com/gitignore/templates/{name}"),
                    token,
                )
                .await?,
        )
    }

    pub async fn licenses(&self, token: Option<&str>) -> Result<Vec<License>, Error> {
        parse_licenses(
            &self
                .fetch("https://api.github.com/licenses?per_page=50", token)
                .await?,
        )
    }

    pub async fn license_body(&self, key: &str, token: Option<&str>) -> Result<String, Error> {
        parse_license_body(
            &self
                .fetch(&format!("https://api.github.com/licenses/{key}"), token)
                .await?,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_gitignore_list_is_a_plain_array_of_names() {
        assert_eq!(
            parse_gitignore_names(r#"["Node","Rust"]"#).expect("список читается"),
            vec!["Node".to_string(), "Rust".to_string()]
        );
    }

    #[test]
    fn the_gitignore_source_is_the_file_content() {
        assert_eq!(
            parse_gitignore_source(r#"{"name":"Node","source":"node_modules/\n"}"#)
                .expect("шаблон читается"),
            "node_modules/\n"
        );
    }

    #[test]
    fn licenses_carry_key_and_human_name() {
        let found = parse_licenses(r#"[{"key":"mit","name":"MIT License"}]"#).expect("читается");
        assert_eq!(found[0].key, "mit");
        assert_eq!(found[0].name, "MIT License");
    }

    #[test]
    fn the_license_body_is_the_file_content() {
        assert_eq!(
            parse_license_body(r#"{"key":"mit","body":"MIT..."}"#).expect("читается"),
            "MIT..."
        );
    }
}
