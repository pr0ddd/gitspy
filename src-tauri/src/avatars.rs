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

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    #[serde(default)]
    pub files: HashMap<String, String>,
    #[serde(default)]
    pub refused: Vec<String>,
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
    std::fs::read_to_string(index_file(dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
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

#[tauri::command]
pub async fn resolve_avatars(
    repo: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), ErrorView> {
    let dir = data_dir(&app)?;
    let mut index = read_index(&dir);

    let emails: Vec<String> = with_repo(&state, &repo, |open| {
        let mut seen = Vec::new();
        for node in &open.history.nodes {
            let Some(meta) = node.commit() else { continue };
            let email = meta.email.to_lowercase();
            if !seen.contains(&email) {
                seen.push(email);
            }
        }
        seen
    })?;

    let unknown: Vec<String> = emails
        .into_iter()
        .filter(|email| !index.files.contains_key(email) && !index.refused.contains(email))
        .collect();
    if unknown.is_empty() {
        return Ok(());
    }

    let mut wanted: HashMap<String, String> = HashMap::new();
    let mut remote: Vec<String> = Vec::new();
    for email in unknown {
        match service_avatar(&email) {
            Some(url) => {
                wanted.insert(email, url);
            }
            None => remote.push(email),
        }
    }

    if !remote.is_empty() {
        if let Some(token) = hosts::token(&app, gitspy_hosts::github::ID) {
            let git = state.git()?;
            let path = std::path::PathBuf::from(&repo);
            let remotes = crate::state::on_reader(move || Ok(git.remote_urls(&path))).await?;
            if let Some((owner, name)) = gitspy_hosts::remote::preferred_github_remote(&remotes) {
                if let Ok(client) = gitspy_hosts::github::GitHub::new() {
                    if let Ok(found) = client.commit_avatars(&token, &owner, &name, 5).await {
                        for (email, url) in found {
                            if remote.contains(&email) {
                                wanted.insert(email, url);
                            }
                        }
                    }
                }
            }
        }
        for email in &remote {
            if !wanted.contains_key(email) && !index.refused.contains(email) {
                index.refused.push(email.clone());
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
        let dir = tempfile::TempDir::new().expect("временный каталог");
        let mut index = Index::default();
        keep_image(dir.path(), "pavel@example.com", b"png", &mut index);
        save_index(dir.path(), &index);

        let back = read_index(dir.path());
        let name = back.files.get("pavel@example.com").expect("запомнено");
        assert!(root(dir.path()).join(name).exists());
    }

    #[test]
    fn neighbouring_emails_do_not_share_a_file() {
        assert_ne!(hashed("a@e"), hashed("b@e"));
    }

    #[test]
    fn a_refusal_is_remembered_so_the_host_is_not_asked_twice() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        let mut index = Index::default();
        index.refused.push("nobody@example.com".to_string());
        save_index(dir.path(), &index);
        assert!(read_index(dir.path())
            .refused
            .contains(&"nobody@example.com".to_string()));
    }

    #[test]
    fn wiping_removes_everything_downloaded() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        let mut index = Index::default();
        keep_image(dir.path(), "a@e", b"png", &mut index);
        save_index(dir.path(), &index);

        wipe(dir.path());
        assert!(read_index(dir.path()).files.is_empty());
    }
}
