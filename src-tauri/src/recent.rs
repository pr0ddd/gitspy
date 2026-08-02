use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const LIMIT: usize = 20;
const FILE: &str = "recent.json";

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepo {
    pub path: String,
    pub name: String,
    pub opened_at: i64,
    #[serde(default)]
    pub exists: bool,
}

pub fn name_of(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn file(dir: &Path) -> PathBuf {
    dir.join(FILE)
}

fn stored(dir: &Path) -> Vec<RecentRepo> {
    let Ok(text) = std::fs::read_to_string(file(dir)) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save(dir: &Path, entries: &[RecentRepo]) {
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    if let Ok(text) = serde_json::to_string_pretty(entries) {
        let _ = std::fs::write(file(dir), text);
    }
}

fn with_existence(mut entries: Vec<RecentRepo>) -> Vec<RecentRepo> {
    for entry in &mut entries {
        entry.exists = Path::new(&entry.path).exists();
    }
    entries
}

pub fn list(dir: &Path) -> Vec<RecentRepo> {
    with_existence(stored(dir))
}

pub fn remember(dir: &Path, path: &str) -> Vec<RecentRepo> {
    let mut entries = stored(dir);
    entries.retain(|e| e.path != path);
    entries.insert(
        0,
        RecentRepo {
            path: path.to_string(),
            name: name_of(path),
            opened_at: now(),
            exists: true,
        },
    );
    entries.truncate(LIMIT);
    save(dir, &entries);
    with_existence(entries)
}

pub fn forget(dir: &Path, path: &str) -> Vec<RecentRepo> {
    let mut entries = stored(dir);
    entries.retain(|e| e.path != path);
    save(dir, &entries);
    with_existence(entries)
}
