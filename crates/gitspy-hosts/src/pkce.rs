use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};

pub fn verifier() -> String {
    let mut raw = [0u8; 48];
    getrandom::fill(&mut raw).expect("системная энтропия доступна");
    URL_SAFE_NO_PAD.encode(raw)
}

pub fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn authorize_url(
    base_url: &str,
    client_id: &str,
    redirect: &str,
    challenge: &str,
    state: &str,
) -> String {
    let encode = |raw: &str| {
        raw.bytes()
            .flat_map(|b| {
                if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
                    vec![b as char]
                } else {
                    format!("%{b:02X}").chars().collect()
                }
            })
            .collect::<String>()
    };
    format!(
        "{}/oauth/authorize?client_id={}&redirect_uri={}&response_type=code&scope=api&code_challenge={}&code_challenge_method=S256&state={}",
        base_url.trim_end_matches('/'),
        encode(client_id),
        encode(redirect),
        encode(challenge),
        encode(state),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_challenge_matches_the_rfc_7636_vector() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            "S256 обязан совпасть с примером из RFC, иначе GitLab отвергнет обмен"
        );
    }

    #[test]
    fn the_verifier_is_long_enough_and_url_safe() {
        let made = verifier();
        assert!(made.len() >= 43 && made.len() <= 128);
        assert!(made
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_')));
        assert_ne!(verifier(), made, "два вызова — два разных секрета");
    }

    #[test]
    fn the_authorize_url_carries_the_pkce_contract() {
        let url = authorize_url(
            "https://gitlab.com/",
            "abc",
            "http://127.0.0.1:53682/callback",
            "CH",
            "st",
        );
        assert!(url.starts_with("https://gitlab.com/oauth/authorize?"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback"));
    }
}
