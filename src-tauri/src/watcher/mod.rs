pub mod ignores;

use ignores::Ignores;
use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer_opt, DebouncedEvent, Debouncer, NoCache};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

const SETTLE: Duration = Duration::from_millis(300);

type Watch = Debouncer<notify::RecommendedWatcher, NoCache>;

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
    let text = path.to_string_lossy().replace('\\', "/");
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
        let mut open = self.open.lock().expect("the watchers map is not poisoned");
        if open.contains_key(&key) {
            return;
        }

        let watched = resolved(repo);
        let root = watched.clone();
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

        let Ok(mut debouncer) = new_debouncer_opt::<_, notify::RecommendedWatcher, NoCache>(
            SETTLE,
            None,
            handler,
            NoCache::new(),
            notify::Config::default(),
        ) else {
            return;
        };

        let _ = debouncer.watch(&root, RecursiveMode::Recursive);
        let elsewhere = git_dir(&root);
        if elsewhere != root.join(".git") {
            let _ = debouncer.watch(&elsewhere, RecursiveMode::Recursive);
        }

        open.insert(key, debouncer);
    }

    pub fn forget(&self, repo: &str) {
        let mut open = self.open.lock().expect("the watchers map is not poisoned");
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
            "editing a file must not cost a re-read of the history"
        );
    }

    #[test]
    fn a_fetch_that_brought_nothing_is_not_a_change() {
        let repo = Path::new("/r");
        assert_eq!(
            what_changed(repo, Path::new("/r/.git/FETCH_HEAD")),
            None,
            "git writes FETCH_HEAD on every fetch, even an empty one, and the fetch now runs on a timer"
        );
        assert_eq!(
            what_changed(repo, Path::new("/r/.git/logs/HEAD")),
            None,
            "the reflog moves after the refs, not instead of them"
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
            "otherwise someone else's commit would never reach the graph"
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
            "a worktree keeps its git directory outside itself, and that is still history"
        );
    }

    #[test]
    fn the_two_kinds_of_change_do_not_share_an_event_name() {
        assert_ne!(Change::Git.event(), Change::WorkingTree.event());
    }

    #[cfg(target_os = "macos")]
    fn waited_for(seen: &std::sync::mpsc::Receiver<Change>) -> Option<Change> {
        seen.recv_timeout(Duration::from_secs(5)).ok()
    }

    fn stragglers_from_setup_drained(seen: &std::sync::mpsc::Receiver<Change>) {
        while seen.recv_timeout(Duration::from_millis(500)).is_ok() {}
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn an_edited_file_reaches_the_application_without_reopening_the_repository() {
        let dir = tempfile::TempDir::new().expect("temp directory");
        std::fs::create_dir_all(dir.path().join(".git")).expect("directory");
        std::fs::write(dir.path().join(".gitignore"), "target/\n").expect("file");

        let (say, seen) = std::sync::mpsc::channel();
        let watchers = Watchers::default();
        watchers.watch(dir.path(), move |change| {
            let _ = say.send(change);
        });

        std::fs::write(dir.path().join("readme.md"), "an edit").expect("file");
        assert_eq!(
            waited_for(&seen),
            Some(Change::WorkingTree),
            "an edit to a file has to arrive on its own, otherwise the counters stand still until the repository is reopened"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn subscribing_does_not_walk_the_tree_no_matter_how_many_files_it_holds() {
        let empty = tempfile::TempDir::new().expect("temp directory");
        std::fs::create_dir_all(empty.path().join(".git")).expect("directory");

        let crowded = tempfile::TempDir::new().expect("temp directory");
        std::fs::create_dir_all(crowded.path().join(".git")).expect("directory");
        for pack in 0..200 {
            let dir = crowded
                .path()
                .join("node_modules")
                .join(format!("pkg{pack}"));
            std::fs::create_dir_all(&dir).expect("directory");
            for file in 0..100 {
                std::fs::write(dir.join(format!("f{file}.js")), "x").expect("file");
            }
        }

        let watchers = Watchers::default();
        let started = std::time::Instant::now();
        watchers.watch(empty.path(), |_| {});
        let baseline = started.elapsed();

        let started = std::time::Instant::now();
        watchers.watch(crowded.path(), |_| {});
        let crowded_took = started.elapsed();

        assert!(
            crowded_took < baseline * 3 + Duration::from_millis(20),
            "subscribing has to be instant rather than a walk over the tree: quesk with 751 thousand files waited 15 seconds; empty {baseline:?}, crowded {crowded_took:?}"
        );
    }

    #[test]
    fn a_build_into_an_ignored_folder_wakes_nobody() {
        let dir = tempfile::TempDir::new().expect("temp directory");
        std::fs::create_dir_all(dir.path().join(".git")).expect("directory");
        std::fs::create_dir_all(dir.path().join("target")).expect("directory");
        std::fs::write(dir.path().join(".gitignore"), "target/\n").expect("file");

        let (say, seen) = std::sync::mpsc::channel();
        let watchers = Watchers::default();
        watchers.watch(dir.path(), move |change| {
            let _ = say.send(change);
        });
        stragglers_from_setup_drained(&seen);

        for i in 0..20 {
            std::fs::write(dir.path().join("target").join(format!("out{i}")), "x").expect("file");
        }
        assert_eq!(
            seen.recv_timeout(Duration::from_secs(2)).ok(),
            None,
            "a build would emit events by the thousand and run git status on every one of them"
        );
    }
}
