use crate::operations::Queue;
use crate::views::{state_lock_failed, ErrorView, RepoView};
use crate::watcher;
use gitspy_core::chunk::Skeleton;
use gitspy_exec::Git;
use gitspy_repo::History;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub repos: Mutex<HashMap<String, OpenRepo>>,
    pub queue: Queue,
    pub watchers: watcher::Watchers,
    git: Mutex<Option<Git>>,
    stale: Mutex<HashMap<String, bool>>,
    autofetch: Mutex<HashMap<String, gitspy_exec::Cancel>>,
    autofetch_minutes: AtomicU64,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            repos: Mutex::default(),
            queue: Queue::default(),
            watchers: watcher::Watchers::default(),
            git: Mutex::default(),
            stale: Mutex::default(),
            autofetch: Mutex::default(),
            autofetch_minutes: AtomicU64::new(crate::autofetch::DEFAULT_MINUTES),
        }
    }
}

pub struct OpenRepo {
    pub path: PathBuf,
    pub history: History,
    pub skeleton: Skeleton,
    pub view: RepoView,
}

impl AppState {
    pub fn autofetch_minutes(&self) -> u64 {
        self.autofetch_minutes.load(Ordering::Relaxed)
    }

    pub fn set_autofetch_minutes(&self, minutes: u64) {
        self.autofetch_minutes
            .store(minutes.min(60), Ordering::Relaxed);
    }

    pub fn needs_reading(&self, repo: &str) -> bool {
        match self.stale.lock() {
            Ok(known) => known.get(repo).copied().unwrap_or(true),
            Err(_) => true,
        }
    }

    pub fn remember_read(&self, repo: &str) {
        if let Ok(mut known) = self.stale.lock() {
            known.insert(repo.to_string(), false);
        }
    }

    pub fn mark_stale(&self, repo: &str) {
        if let Ok(mut known) = self.stale.lock() {
            known.insert(repo.to_string(), true);
        }
    }

    pub fn remember_autofetch(&self, repo: &str, cancel: gitspy_exec::Cancel) {
        if let Ok(mut running) = self.autofetch.lock() {
            running.insert(repo.to_string(), cancel);
        }
    }

    pub fn forget_autofetch(&self, repo: &str) {
        if let Ok(mut running) = self.autofetch.lock() {
            running.remove(repo);
        }
    }

    pub fn cancel_autofetch(&self, repo: &str) {
        if let Ok(mut running) = self.autofetch.lock() {
            if let Some(cancel) = running.remove(repo) {
                cancel.ask();
            }
        }
    }

    pub fn git(&self) -> Result<Git, ErrorView> {
        let mut slot = self.git.lock().map_err(|_| state_lock_failed())?;
        if let Some(found) = slot.as_ref() {
            return Ok(found.clone());
        }
        let found = Git::discover().map_err(|e| ErrorView::new(e.code()))?;
        *slot = Some(found.clone());
        Ok(found)
    }
}

pub fn with_repo<T>(
    state: &State<'_, AppState>,
    repo: &str,
    f: impl FnOnce(&OpenRepo) -> T,
) -> Result<T, ErrorView> {
    let guard = state.repos.lock().map_err(|_| state_lock_failed())?;
    let open = guard
        .get(repo)
        .ok_or_else(|| ErrorView::new("repo.notOpen").param("path", repo))?;
    Ok(f(open))
}

pub fn exec_error(e: gitspy_exec::Error) -> ErrorView {
    let view = ErrorView::new(e.code());
    match e.detail() {
        Some(detail) => view.detail(detail),
        None => view,
    }
}

pub async fn on_reader<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, ErrorView> + Send + 'static,
) -> Result<T, ErrorView> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_repository_read_once_is_not_read_again_until_git_changes() {
        let state = AppState::default();

        assert!(state.needs_reading("/r"), "the first read has to happen");
        state.remember_read("/r");
        assert!(
            !state.needs_reading("/r"),
            "reopening the tab must not cost another walk over the history"
        );

        state.mark_stale("/r");
        assert!(
            state.needs_reading("/r"),
            "after a commit made from the terminal what we read is no longer good"
        );
    }

    #[test]
    fn repositories_do_not_share_freshness() {
        let state = AppState::default();
        state.remember_read("/one");
        state.mark_stale("/one");
        assert!(state.needs_reading("/one"));
        assert!(
            state.needs_reading("/two"),
            "we know nothing about the second one"
        );
    }
}

#[tauri::command]
pub fn set_autofetch_minutes(minutes: u64, state: State<'_, AppState>) {
    state.set_autofetch_minutes(minutes);
}

#[cfg(test)]
mod release_guards {
    #[test]
    fn devtools_are_not_compiled_into_release_builds() {
        let manifest = include_str!("../Cargo.toml");
        let tauri_line = manifest
            .lines()
            .find(|line| line.trim_start().starts_with("tauri = "))
            .expect("the tauri dependency is declared");
        assert!(
            !tauri_line.contains("devtools"),
            "the `devtools` feature of tauri turns the inspector on in release builds too; \
             only code under cfg(debug_assertions) may open the debug window"
        );

        let config = include_str!("../tauri.conf.json");
        assert!(
            !config.contains("\"devtools\": true"),
            "tauri.conf.json must not enable devtools for the window, otherwise they ship to production"
        );
    }
}
