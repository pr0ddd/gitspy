use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use ts_rs::TS;

const LIMIT: usize = 20;
const FILE: &str = "recent.json";

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RecentRepo {
    pub path: String,
    pub name: String,
    #[ts(type = "number")]
    pub opened_at: i64,
    #[serde(default)]
    pub exists: bool,
    #[serde(default)]
    pub favorite: bool,
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
    let Ok(text) = serde_json::to_string_pretty(entries) else {
        return;
    };

    let target = file(dir);
    let scratch = target.with_extension(format!("{}.tmp", std::process::id()));
    if std::fs::write(&scratch, text).is_ok() && std::fs::rename(&scratch, &target).is_err() {
        let _ = std::fs::remove_file(&scratch);
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
    let starred = entries
        .iter()
        .find(|e| e.path == path)
        .is_some_and(|e| e.favorite);
    entries.retain(|e| e.path != path);
    entries.insert(
        0,
        RecentRepo {
            path: path.to_string(),
            name: name_of(path),
            opened_at: now(),
            exists: true,
            favorite: starred,
        },
    );
    let mut spare = LIMIT;
    entries.retain(|e| {
        if e.favorite {
            return true;
        }
        if spare == 0 {
            return false;
        }
        spare -= 1;
        true
    });
    save(dir, &entries);
    with_existence(entries)
}

pub fn favorite(dir: &Path, path: &str, on: bool) -> Vec<RecentRepo> {
    let mut entries = stored(dir);
    for entry in &mut entries {
        if entry.path == path {
            entry.favorite = on;
        }
    }
    save(dir, &entries);
    with_existence(entries)
}

pub fn forget(dir: &Path, path: &str) -> Vec<RecentRepo> {
    let mut entries = stored(dir);
    entries.retain(|e| e.path != path);
    save(dir, &entries);
    with_existence(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_shorter_list_does_not_leave_the_tail_of_the_longer_one_behind() {
        let dir = tempfile::tempdir().expect("временный каталог");
        for path in ["/one", "/two", "/three"] {
            remember(dir.path(), path);
        }
        let long = std::fs::metadata(file(dir.path()))
            .expect("файл есть")
            .len();

        forget(dir.path(), "/two");
        forget(dir.path(), "/three");

        let text = std::fs::read_to_string(file(dir.path())).expect("файл читается");
        assert!(
            (text.len() as u64) < long,
            "файл обязан стать короче, иначе поверх длинного списка лежит короткий"
        );
        assert!(
            serde_json::from_str::<Vec<RecentRepo>>(&text).is_ok(),
            "остаток прежней записи делает список нечитаемым, и вся история пропадает молча"
        );
        assert_eq!(list(dir.path()).len(), 1);
    }

    #[test]
    fn favorite_survives_reopening_the_repository() {
        let dir = tempfile::tempdir().expect("временный каталог");
        remember(dir.path(), "/one");
        favorite(dir.path(), "/one", true);
        remember(dir.path(), "/one");
        assert!(
            list(dir.path())[0].favorite,
            "повторное открытие не должно снимать звезду"
        );
    }

    #[test]
    fn favorite_toggles_both_ways() {
        let dir = tempfile::tempdir().expect("временный каталог");
        remember(dir.path(), "/one");
        assert!(favorite(dir.path(), "/one", true)[0].favorite);
        assert!(!favorite(dir.path(), "/one", false)[0].favorite);
    }

    #[test]
    fn favorites_are_not_evicted_by_the_limit() {
        let dir = tempfile::tempdir().expect("временный каталог");
        remember(dir.path(), "/keep");
        favorite(dir.path(), "/keep", true);
        for i in 0..30 {
            remember(dir.path(), &format!("/r{i}"));
        }
        assert!(
            list(dir.path()).iter().any(|e| e.path == "/keep"),
            "звезда обязана защищать запись от вытеснения из хвоста"
        );
    }

    #[test]
    fn nothing_temporary_is_left_lying_next_to_the_list() {
        let dir = tempfile::tempdir().expect("временный каталог");
        remember(dir.path(), "/one");

        let stray: Vec<String> = std::fs::read_dir(dir.path())
            .expect("каталог читается")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name != FILE)
            .collect();

        assert!(stray.is_empty(), "остались файлы: {stray:?}");
    }
}
