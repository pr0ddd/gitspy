use crate::events;
use crate::hosts;
use crate::paths::data_dir;
use crate::state::{with_repo, AppState};
use crate::views::ErrorView;
use gitspy_hosts::avatars::service_avatar;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{Emitter, State};

const RESOLVER_GENERATION: u32 = 2;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    #[serde(default)]
    pub files: HashMap<String, String>,
    #[serde(default)]
    pub refused: Vec<String>,
    #[serde(default)]
    pub version: u32,
}

impl Default for Index {
    fn default() -> Self {
        Self {
            files: HashMap::new(),
            refused: Vec::new(),
            version: RESOLVER_GENERATION,
        }
    }
}

fn hashed(email: &str) -> String {
    let mut hash: u64 = 1469598103934665603;
    for byte in email.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1099511628211);
    }
    format!("{hash:016x}")
}

fn root(dir: &Path) -> PathBuf {
    dir.join("avatars")
}

fn index_file(dir: &Path) -> PathBuf {
    root(dir).join("index.json")
}

pub fn read_index(dir: &Path) -> Index {
    let mut index: Index = std::fs::read_to_string(index_file(dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    if index.version < RESOLVER_GENERATION {
        index.refused.clear();
        index.version = RESOLVER_GENERATION;
    }
    index.files.retain(|_, name| root(dir).join(name).exists());
    index
}

pub fn save_index(dir: &Path, index: &Index) {
    if std::fs::create_dir_all(root(dir)).is_err() {
        return;
    }
    if let Ok(text) = serde_json::to_string(index) {
        let _ = std::fs::write(index_file(dir), text);
    }
}

pub fn keep_image(dir: &Path, email: &str, bytes: &[u8], index: &mut Index) {
    let name = format!("{}.img", hashed(email));
    let target = root(dir).join(&name);
    if std::fs::create_dir_all(root(dir)).is_err() {
        return;
    }
    if std::fs::write(&target, bytes).is_ok() {
        index.files.insert(email.to_lowercase(), name);
    }
}

pub fn wipe(dir: &Path) {
    let _ = std::fs::remove_dir_all(root(dir));
}

#[tauri::command]
pub fn avatar_paths(
    repo: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<HashMap<String, String>, ErrorView> {
    let dir = data_dir(&app)?;
    let index = read_index(&dir);

    with_repo(&state, &repo, |open| {
        let mut found = HashMap::new();
        for node in &open.history.nodes {
            let Some(meta) = node.commit() else { continue };
            let email = meta.email.to_lowercase();
            if found.contains_key(&email) {
                continue;
            }
            if let Some(name) = index.files.get(&email) {
                found.insert(email, root(&dir).join(name).display().to_string());
            }
        }
        found
    })
}

async fn fetch_bytes(url: &str) -> Option<Vec<u8>> {
    let response = reqwest::get(url).await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    response.bytes().await.ok().map(|b| b.to_vec())
}

const EXACT_LOOKUPS_PER_RUN: usize = 500;
const LOOKUPS_AT_ONCE: usize = 8;

async fn resolve_on_host(
    client: &gitspy_hosts::host::Host,
    token: &str,
    owner: &str,
    name: &str,
    remote: &[(String, String)],
    wanted: &mut HashMap<String, String>,
    index: &mut Index,
) {
    if let Ok(found) = client.commit_avatars(token, owner, name, 5).await {
        for (email, url) in found {
            if remote.iter().any(|(known, _)| known == &email) {
                wanted.insert(email, url);
            }
        }
    }

    let leftovers: Vec<&(String, String)> = remote
        .iter()
        .filter(|(email, _)| !wanted.contains_key(email))
        .take(EXACT_LOOKUPS_PER_RUN)
        .collect();

    for chunk in leftovers.chunks(LOOKUPS_AT_ONCE) {
        let asked = futures_util::future::join_all(chunk.iter().map(|(email, hash)| async move {
            (
                email.clone(),
                client.commit_author(token, owner, name, hash).await,
            )
        }))
        .await;

        let mut throttled = false;
        for (email, resolved) in asked {
            match resolved {
                Ok(Some((_, url))) => {
                    wanted.insert(email, url);
                }
                Ok(None) => {
                    if !index.refused.contains(&email) {
                        index.refused.push(email);
                    }
                }
                Err(_) => {
                    throttled = true;
                }
            }
        }
        if throttled {
            return;
        }
    }
}

#[tauri::command]
pub async fn resolve_avatars(
    repo: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), ErrorView> {
    let dir = data_dir(&app)?;
    let mut index = read_index(&dir);

    let authors: Vec<(String, String)> = with_repo(&state, &repo, |open| {
        let mut seen: Vec<(String, String)> = Vec::new();
        for node in &open.history.nodes {
            let Some(meta) = node.commit() else { continue };
            let email = meta.email.to_lowercase();
            if !seen.iter().any(|(known, _)| known == &email) {
                seen.push((email, meta.hash.clone()));
            }
        }
        seen
    })?;

    let unknown: Vec<(String, String)> = authors
        .into_iter()
        .filter(|(email, _)| !index.files.contains_key(email) && !index.refused.contains(email))
        .collect();
    if unknown.is_empty() {
        return Ok(());
    }

    let mut wanted: HashMap<String, String> = HashMap::new();
    let mut remote: Vec<(String, String)> = Vec::new();
    for (email, hash) in unknown {
        match service_avatar(&email) {
            Some(url) => {
                wanted.insert(email, url);
            }
            None => remote.push((email, hash)),
        }
    }

    if !remote.is_empty() {
        if let Ok((connection, owner, name)) = hosts::connected_target(&app, &state, &repo).await {
            if let Some(token) = hosts::token(&app, &connection.id) {
                if let Ok(client) =
                    gitspy_hosts::host::Host::for_connection(connection.kind, &connection.base_url)
                {
                    resolve_on_host(
                        &client,
                        &token,
                        &owner,
                        &name,
                        &remote,
                        &mut wanted,
                        &mut index,
                    )
                    .await;
                }
            }
        }
    }

    let mut changed = false;
    let mut fresh = 0u32;
    for (email, url) in wanted {
        if let Some(bytes) = fetch_bytes(&url).await {
            keep_image(&dir, &email, &bytes, &mut index);
            changed = true;
            fresh += 1;
        } else if !index.refused.contains(&email) {
            index.refused.push(email.clone());
        }
        save_index(&dir, &index);

        if fresh > 0 && fresh % 8 == 0 {
            let _ = app.emit(events::AVATARS_CHANGED, &repo);
        }
    }

    save_index(&dir, &index);
    if changed {
        let _ = app.emit(events::AVATARS_CHANGED, &repo);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_kept_image_is_found_again_by_its_email() {
        let dir = tempfile::TempDir::new().expect("temp directory");
        let mut index = Index::default();
        keep_image(dir.path(), "pavel@example.com", b"png", &mut index);
        save_index(dir.path(), &index);

        let back = read_index(dir.path());
        let name = back.files.get("pavel@example.com").expect("remembered");
        assert!(root(dir.path()).join(name).exists());
    }

    #[test]
    fn neighbouring_emails_do_not_share_a_file() {
        assert_ne!(hashed("a@e"), hashed("b@e"));
    }

    #[test]
    fn a_refusal_is_remembered_so_the_host_is_not_asked_twice() {
        let dir = tempfile::TempDir::new().expect("temp directory");
        let mut index = Index::default();
        index.refused.push("nobody@example.com".to_string());
        save_index(dir.path(), &index);
        assert!(read_index(dir.path())
            .refused
            .contains(&"nobody@example.com".to_string()));
    }

    #[test]
    fn refusals_of_an_older_resolver_are_retried_and_files_are_kept() {
        let dir = tempfile::TempDir::new().expect("temp directory");
        std::fs::create_dir_all(dir.path().join("avatars")).expect("avatars directory");
        std::fs::write(dir.path().join("avatars").join("x.img"), b"png").expect("image on disk");
        std::fs::write(
            dir.path().join("avatars").join("index.json"),
            r#"{"files":{"a@e":"x.img"},"refused":["b@e"]}"#,
        )
        .expect("old index without a version");

        let back = read_index(dir.path());
        assert!(
            back.refused.is_empty(),
            "refusals recorded by the weaker resolver deserve a second attempt"
        );
        assert_eq!(
            back.files.get("a@e").map(String::as_str),
            Some("x.img"),
            "downloaded images survive a resolver change"
        );
    }

    #[test]
    fn an_entry_whose_file_vanished_is_forgotten_so_the_picture_is_fetched_again() {
        let dir = tempfile::TempDir::new().expect("temp directory");
        let mut index = Index::default();
        keep_image(dir.path(), "kept@e", b"png", &mut index);
        keep_image(dir.path(), "lost@e", b"png", &mut index);
        save_index(dir.path(), &index);

        let lost = root(dir.path()).join(index.files.get("lost@e").expect("recorded"));
        std::fs::remove_file(lost).expect("image vanished behind our back");

        let back = read_index(dir.path());
        assert!(
            !back.files.contains_key("lost@e"),
            "an entry without a file promises an image that is not there: the frontend gets a broken path and the resolver treats the email as known and never downloads it again"
        );
        assert!(
            back.files.contains_key("kept@e"),
            "the cleanup leaves surviving images alone"
        );
    }

    #[test]
    fn wiping_removes_everything_downloaded() {
        let dir = tempfile::TempDir::new().expect("temp directory");
        let mut index = Index::default();
        keep_image(dir.path(), "a@e", b"png", &mut index);
        save_index(dir.path(), &index);

        wipe(dir.path());
        assert!(read_index(dir.path()).files.is_empty());
    }
}
