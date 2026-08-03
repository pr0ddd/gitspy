pub mod ignores;

use ignores::Ignores;
use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebouncedEvent, Debouncer, RecommendedCache};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

const SETTLE: Duration = Duration::from_millis(300);

type Watch = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Git,
    WorkingTree,
}

impl Change {
    pub fn event(&self) -> &'static str {
        match self {
            Change::Git => "repo:changed",
            Change::WorkingTree => "worktree:changed",
        }
    }
}

#[derive(Default)]
pub struct Watchers {
    open: Mutex<HashMap<String, Watch>>,
}

fn noise(path: &Path) -> bool {
    let text = path.to_string_lossy();
    text.ends_with(".lock")
        || text.contains("/objects/tmp_")
        || text.ends_with("/FETCH_HEAD")
        || text.contains("/.git/logs/")
}

pub fn what_changed(repo: &Path, path: &Path) -> Option<Change> {
    if noise(path) {
        return None;
    }

    if path.starts_with(repo.join(".git")) {
        return Some(Change::Git);
    }
    Some(if path.starts_with(repo) {
        Change::WorkingTree
    } else {
        Change::Git
    })
}

fn changes(repo: &Path, ignores: &Ignores, events: &[DebouncedEvent]) -> Vec<Change> {
    let mut seen: Vec<Change> = Vec::new();

    for path in events.iter().flat_map(|event| event.paths.iter()) {
        let Some(change) = what_changed(repo, path) else {
            continue;
        };
        if change == Change::WorkingTree && ignores.hides(path) {
            continue;
        }
        if !seen.contains(&change) {
            seen.push(change);
        }
    }
    seen
}

impl Watchers {
    pub fn watch(&self, repo: &Path, mut changed: impl FnMut(Change) + Send + 'static) {
        let key = repo.display().to_string();
        let mut open = self.open.lock().expect("наблюдатели не отравлены");
        if open.contains_key(&key) {
            return;
        }

        let watched = resolved(repo);
        let mut ignores = Ignores::at(&watched);
        let mut rules_written = written_at(&watched.join(".gitignore"));

        let handler = move |result: notify_debouncer_full::DebounceEventResult| {
            let Ok(events) = result else {
                return;
            };

            let written = written_at(&watched.join(".gitignore"));
            if written != rules_written {
                rules_written = written;
                ignores = Ignores::at(&watched);
            }

            for change in changes(&watched, &ignores, &events) {
                changed(change);
            }
        };

        let Ok(mut debouncer) = new_debouncer(SETTLE, None, handler) else {
            return;
        };

        let _ = debouncer.watch(repo, RecursiveMode::Recursive);
        let elsewhere = git_dir(repo);
        if elsewhere != repo.join(".git") {
            let _ = debouncer.watch(&elsewhere, RecursiveMode::Recursive);
        }

        open.insert(key, debouncer);
    }

    pub fn forget(&self, repo: &str) {
        let mut open = self.open.lock().expect("наблюдатели не отравлены");
        open.remove(repo);
    }
}

fn resolved(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn written_at(path: &Path) -> Option<std::time::SystemTime> {
    std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
}

pub fn git_dir(repo: &Path) -> PathBuf {
    let dot = repo.join(".git");
    if dot.is_dir() {
        dot
    } else {
        repo.to_path_buf()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_change_inside_the_git_directory_is_history_not_the_working_tree() {
        let repo = Path::new("/r");
        assert_eq!(
            what_changed(repo, Path::new("/r/.git/refs/heads/main")),
            Some(Change::Git)
        );
        assert_eq!(
            what_changed(repo, Path::new("/r/src/App.tsx")),
            Some(Change::WorkingTree),
            "правка файла не должна стоить перечитывания истории"
        );
    }

    #[test]
    fn a_fetch_that_brought_nothing_is_not_a_change() {
        let repo = Path::new("/r");
        assert_eq!(
            what_changed(repo, Path::new("/r/.git/FETCH_HEAD")),
            None,
            "git пишет FETCH_HEAD на каждый фетч, даже пустой, а фетч теперь идёт по таймеру"
        );
        assert_eq!(
            what_changed(repo, Path::new("/r/.git/logs/HEAD")),
            None,
            "рефлог движется вслед за ссылками, а не вместо них"
        );
    }

    #[test]
    fn a_fetch_that_moved_a_remote_branch_is_a_change() {
        assert_eq!(
            what_changed(
                Path::new("/r"),
                Path::new("/r/.git/refs/remotes/origin/main")
            ),
            Some(Change::Git),
            "иначе чужой коммит никогда не доедет до графа"
        );
    }

    #[test]
    fn a_lock_file_is_not_a_change_anybody_needs_to_see() {
        let repo = Path::new("/r");
        assert_eq!(what_changed(repo, Path::new("/r/.git/index.lock")), None);
        assert_eq!(
            what_changed(repo, Path::new("/r/.git/objects/tmp_object_1")),
            None
        );
    }

    #[test]
    fn a_git_directory_kept_elsewhere_still_counts_as_history() {
        assert_eq!(
            what_changed(Path::new("/r"), Path::new("/store/worktrees/r/HEAD")),
            Some(Change::Git),
            "у рабочей копии git-каталог лежит вне её, и это по-прежнему история"
        );
    }

    #[test]
    fn the_two_kinds_of_change_do_not_share_an_event_name() {
        assert_ne!(Change::Git.event(), Change::WorkingTree.event());
    }

    fn waited_for(seen: &std::sync::mpsc::Receiver<Change>) -> Option<Change> {
        seen.recv_timeout(Duration::from_secs(5)).ok()
    }

    #[test]
    fn an_edited_file_reaches_the_application_without_reopening_the_repository() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        std::fs::create_dir_all(dir.path().join(".git")).expect("каталог");
        std::fs::write(dir.path().join(".gitignore"), "target/\n").expect("файл");

        let (say, seen) = std::sync::mpsc::channel();
        let watchers = Watchers::default();
        watchers.watch(dir.path(), move |change| {
            let _ = say.send(change);
        });

        std::fs::write(dir.path().join("readme.md"), "правка").expect("файл");
        assert_eq!(
            waited_for(&seen),
            Some(Change::WorkingTree),
            "правка файла обязана доходить сама, иначе счётчик стоит до переоткрытия"
        );
    }

    #[test]
    fn a_build_into_an_ignored_folder_wakes_nobody() {
        let dir = tempfile::TempDir::new().expect("временный каталог");
        std::fs::create_dir_all(dir.path().join(".git")).expect("каталог");
        std::fs::create_dir_all(dir.path().join("target")).expect("каталог");
        std::fs::write(dir.path().join(".gitignore"), "target/\n").expect("файл");

        let (say, seen) = std::sync::mpsc::channel();
        let watchers = Watchers::default();
        watchers.watch(dir.path(), move |change| {
            let _ = say.send(change);
        });

        for i in 0..20 {
            std::fs::write(dir.path().join("target").join(format!("out{i}")), "x").expect("файл");
        }
        assert_eq!(
            seen.recv_timeout(Duration::from_secs(2)).ok(),
            None,
            "сборка писала бы события тысячами и дёргала git status на каждое"
        );
    }
}
