use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebouncedEvent, Debouncer, RecommendedCache};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

const SETTLE: Duration = Duration::from_millis(300);

type Watch = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

#[derive(Default)]
pub struct Watchers {
    open: Mutex<HashMap<String, Watch>>,
}

fn touches_git_state(events: &[DebouncedEvent]) -> bool {
    events.iter().any(|event| {
        event.paths.iter().any(|path| {
            let text = path.to_string_lossy();
            !text.ends_with(".lock") && !text.contains("/objects/tmp_")
        })
    })
}

impl Watchers {
    pub fn watch(&self, repo: &str, git_dir: &Path, mut changed: impl FnMut() + Send + 'static) {
        let mut open = self.open.lock().expect("наблюдатели не отравлены");
        if open.contains_key(repo) {
            return;
        }

        let handler = move |result: notify_debouncer_full::DebounceEventResult| {
            if let Ok(events) = result {
                if touches_git_state(&events) {
                    changed();
                }
            }
        };
        let Ok(mut debouncer) = new_debouncer(SETTLE, None, handler) else {
            return;
        };

        for target in [
            git_dir.join("refs"),
            git_dir.join("HEAD"),
            git_dir.to_path_buf(),
        ] {
            let mode = if target.is_dir() {
                RecursiveMode::Recursive
            } else {
                RecursiveMode::NonRecursive
            };
            let _ = debouncer.watch(&target, mode);
        }

        open.insert(repo.to_string(), debouncer);
    }

    pub fn forget(&self, repo: &str) {
        let mut open = self.open.lock().expect("наблюдатели не отравлены");
        open.remove(repo);
    }
}

pub fn git_dir(repo: &Path) -> PathBuf {
    let dot = repo.join(".git");
    if dot.is_dir() {
        dot
    } else {
        repo.to_path_buf()
    }
}
