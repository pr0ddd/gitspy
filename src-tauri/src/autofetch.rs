use crate::operations::{self, Operation};
use crate::state::AppState;
use gitspy_exec::Cancel;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

pub const DEFAULT_MINUTES: u64 = 1;

pub fn should_skip(lane_busy: bool, has_remote: bool) -> bool {
    lane_busy || !has_remote
}

pub fn interval(minutes: u64) -> Duration {
    Duration::from_secs(minutes.max(1) * 60)
}

pub fn due(elapsed: Duration, minutes: u64) -> bool {
    minutes > 0 && elapsed >= interval(minutes)
}

const TICK: Duration = Duration::from_secs(15);

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut swept = std::time::Instant::now();
        loop {
            std::thread::sleep(TICK);
            let minutes = app.state::<AppState>().autofetch_minutes();
            if due(swept.elapsed(), minutes) {
                sweep(&app);
                swept = std::time::Instant::now();
            }
        }
    });
}

fn open_paths(state: &AppState) -> Vec<(String, PathBuf)> {
    let Ok(open) = state.repos.lock() else {
        return Vec::new();
    };
    open.iter()
        .map(|(key, repo)| (key.clone(), repo.path.clone()))
        .collect()
}

fn sweep(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let Ok(git) = state.git() else {
        return;
    };

    for (key, path) in open_paths(&state) {
        let lane = state.queue.lane(&key);
        let held = lane.try_lock().ok();
        if should_skip(held.is_none(), !git.remotes(&path).is_empty()) {
            continue;
        }

        let cancel = Cancel::new();
        state.remember_autofetch(&key, cancel.clone());
        let _ = operations::run(&git, &path, Operation::Fetch, None, &cancel, &mut |_| {});
        state.forget_autofetch(&key);
        drop(held);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_busy_lane_is_left_alone() {
        assert!(
            should_skip(true, true),
            "фоновая задача встала бы поперёк push, начатого человеком"
        );
    }

    #[test]
    fn a_repository_without_remotes_is_never_fetched() {
        assert!(
            should_skip(false, false),
            "фетчить нечего и не у кого, а процесс git всё равно стоил бы двадцать миллисекунд"
        );
    }

    #[test]
    fn an_idle_repository_with_a_remote_is_fetched() {
        assert!(!should_skip(false, true));
    }

    #[test]
    fn a_minute_is_the_measured_default_and_zero_never_becomes_a_busy_loop() {
        assert_eq!(DEFAULT_MINUTES, 1, "замерено по журналам the reference client");
        assert_eq!(interval(DEFAULT_MINUTES), Duration::from_secs(60));
        assert_eq!(
            interval(0),
            Duration::from_secs(60),
            "нулевой интервал крутил бы фетч без остановки"
        );
    }

    #[test]
    fn the_sweep_is_due_by_the_current_setting_and_zero_switches_it_off() {
        assert!(due(Duration::from_secs(60), 1));
        assert!(
            !due(Duration::from_secs(59), 1),
            "рано: минута ещё не прошла"
        );
        assert!(
            !due(Duration::from_secs(3600), 0),
            "ноль — это выключено, а не «фетчить всегда»"
        );
        assert!(
            due(Duration::from_secs(300), 5),
            "смена настройки действует со следующего тика, без перезапуска"
        );
    }
}
