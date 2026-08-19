use crate::banner;
use crate::events;
use crate::paths;
use crate::views::{AvailableUpdateView, BannerUpdateView, ErrorView, UpdatePhase};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

const MARKER_FILE: &str = "update-seen";
const FIRST_CHECK_AFTER: Duration = Duration::from_secs(10);
const CHECK_EVERY: Duration = Duration::from_secs(60 * 60);
const LAUNCH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const CLICK_CHECK_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
pub struct Updates(Mutex<UpdateState>);

#[derive(Default)]
struct UpdateState {
    available: Option<AvailableUpdateView>,
    banner: Option<BannerUpdateView>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Origin {
    Launch,
    Click,
}

pub fn is_newer(candidate: &str, current: &str) -> bool {
    match (
        semver::Version::parse(candidate),
        semver::Version::parse(current),
    ) {
        (Ok(candidate), Ok(current)) => candidate > current,
        _ => false,
    }
}

pub fn installs_in_place(bundle: Option<tauri::utils::config::BundleType>) -> bool {
    use tauri::utils::config::BundleType;
    !matches!(bundle, Some(BundleType::Deb) | Some(BundleType::Rpm))
}

fn installable() -> bool {
    installs_in_place(tauri::utils::platform::bundle_type())
}

fn marker_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    paths::data_dir(app).ok().map(|dir| dir.join(MARKER_FILE))
}

pub fn read_marker(app: &tauri::AppHandle) -> Option<String> {
    let path = marker_path(app)?;
    let version = std::fs::read_to_string(path).ok()?;
    let version = version.trim();
    (!version.is_empty()).then(|| version.to_string())
}

fn write_marker(app: &tauri::AppHandle, version: &str) {
    if let Some(path) = marker_path(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(path, version);
    }
}

fn clear_marker(app: &tauri::AppHandle) {
    if let Some(path) = marker_path(app) {
        let _ = std::fs::remove_file(path);
    }
}

fn current_version(app: &tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

pub fn launch_installs_marked_update(marker: Option<&str>, current: &str) -> bool {
    marker.is_some_and(|version| is_newer(version, current))
}

pub fn install_at_launch_when_marked(app: &tauri::AppHandle) {
    let marker = read_marker(app);
    if !launch_installs_marked_update(marker.as_deref(), &current_version(app)) {
        if marker.is_some() {
            clear_marker(app);
        }
        return;
    }
    if !installable() {
        clear_marker(app);
        return;
    }
    banner::update_started(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        install_flow(&app, Origin::Launch).await;
    });
}

pub fn watch_in_background(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK_AFTER).await;
        loop {
            check_once(&app).await;
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

async fn check_once(app: &tauri::AppHandle) {
    let Ok(updater) = app.updater_builder().timeout(CLICK_CHECK_TIMEOUT).build() else {
        return;
    };
    let Ok(Some(update)) = updater.check().await else {
        return;
    };
    let view = AvailableUpdateView {
        version: update.version.clone(),
        installable: installable(),
    };
    if installable() {
        write_marker(app, &update.version);
    }
    if let Ok(mut state) = app.state::<Updates>().0.lock() {
        state.available = Some(view.clone());
    }
    let _ = app.emit_to(banner::MAIN, events::UPDATE_AVAILABLE, Some(view));
}

#[tauri::command]
pub fn available_update(app: tauri::AppHandle) -> Option<AvailableUpdateView> {
    app.state::<Updates>()
        .0
        .lock()
        .ok()
        .and_then(|state| state.available.clone())
}

#[tauri::command]
pub fn install_update(app: tauri::AppHandle) -> Result<(), ErrorView> {
    if !installable() {
        return Err(ErrorView::new("update.notInstallable"));
    }
    banner::show_banner_for_update(&app)?;
    tauri::async_runtime::spawn(async move {
        install_flow(&app, Origin::Click).await;
    });
    Ok(())
}

pub fn replay_banner(app: &tauri::AppHandle) {
    let current = app
        .state::<Updates>()
        .0
        .lock()
        .ok()
        .and_then(|state| state.banner.clone());
    if let Some(view) = current {
        let _ = app.emit_to(banner::BANNER, events::BANNER_UPDATE, view);
    }
}

fn show_phase(app: &tauri::AppHandle, phase: UpdatePhase, version: &str, percent: u8) {
    let view = BannerUpdateView {
        phase,
        version: version.to_string(),
        percent,
    };
    if let Ok(mut state) = app.state::<Updates>().0.lock() {
        state.banner = Some(view.clone());
    }
    let _ = app.emit_to(banner::BANNER, events::BANNER_UPDATE, view);
}

enum Outcome {
    Restarting,
    Nothing,
    Failed(String),
}

async fn install_flow(app: &tauri::AppHandle, origin: Origin) {
    let outcome = run_install(app, origin).await;
    if let Ok(mut state) = app.state::<Updates>().0.lock() {
        state.banner = None;
    }
    match outcome {
        Outcome::Restarting => app.restart(),
        Outcome::Nothing => {
            clear_marker(app);
            if let Ok(mut state) = app.state::<Updates>().0.lock() {
                state.available = None;
            }
            let _ = app.emit_to(
                banner::MAIN,
                events::UPDATE_AVAILABLE,
                None::<AvailableUpdateView>,
            );
            finish(app, origin);
        }
        Outcome::Failed(detail) => {
            finish(app, origin);
            if origin == Origin::Click {
                let _ = app.emit_to(
                    banner::MAIN,
                    events::UPDATE_FAILED,
                    ErrorView::new("update.failed").detail(detail),
                );
            }
        }
    }
}

fn finish(app: &tauri::AppHandle, origin: Origin) {
    match origin {
        Origin::Launch => banner::update_finished(app),
        Origin::Click => banner::reveal_main(app),
    }
}

async fn run_install(app: &tauri::AppHandle, origin: Origin) -> Outcome {
    let timeout = match origin {
        Origin::Launch => LAUNCH_CHECK_TIMEOUT,
        Origin::Click => CLICK_CHECK_TIMEOUT,
    };
    let marked = read_marker(app).unwrap_or_default();
    show_phase(app, UpdatePhase::Checking, &marked, 0);
    let updater = match app.updater_builder().timeout(timeout).build() {
        Ok(updater) => updater,
        Err(e) => return Outcome::Failed(e.to_string()),
    };
    let mut update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return Outcome::Nothing,
        Err(e) => return Outcome::Failed(e.to_string()),
    };
    update.timeout = None;
    let version = update.version.clone();
    write_marker(app, &version);
    show_phase(app, UpdatePhase::Downloading, &version, 0);
    let progress = app.clone();
    let progress_version = version.clone();
    let mut received: u64 = 0;
    let bytes = update
        .download(
            |chunk, total| {
                received += chunk as u64;
                if let Some(total) = total.filter(|total| *total > 0) {
                    let percent = ((received * 100) / total).min(100) as u8;
                    show_phase(
                        &progress,
                        UpdatePhase::Downloading,
                        &progress_version,
                        percent,
                    );
                }
            },
            || {},
        )
        .await;
    let bytes = match bytes {
        Ok(bytes) => bytes,
        Err(e) => return Outcome::Failed(e.to_string()),
    };
    show_phase(app, UpdatePhase::Installing, &version, 100);
    if let Err(e) = update.install(bytes) {
        return Outcome::Failed(e.to_string());
    }
    clear_marker(app);
    show_phase(app, UpdatePhase::Restarting, &version, 100);
    Outcome::Restarting
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::utils::config::BundleType;

    #[test]
    fn a_marker_newer_than_the_running_version_makes_the_launch_install() {
        assert!(
            launch_installs_marked_update(Some("1.3.0"), "1.2.0"),
            "the previous session saw 1.3.0, so this launch installs it behind the banner"
        );
    }

    #[test]
    fn a_launch_without_a_marker_does_not_wait_for_the_network() {
        assert!(
            !launch_installs_marked_update(None, "1.2.0"),
            "nothing was seen, so the app opens at once and the check runs in the background"
        );
    }

    #[test]
    fn a_marker_left_by_the_version_that_is_now_running_is_stale() {
        assert!(
            !launch_installs_marked_update(Some("1.3.0"), "1.3.0"),
            "after a Windows install the marker names the version already running"
        );
        assert!(
            !launch_installs_marked_update(Some("1.2.9"), "1.3.0"),
            "a marker older than the binary is noise, not an update"
        );
    }

    #[test]
    fn a_marker_that_is_not_a_version_is_ignored() {
        assert!(!launch_installs_marked_update(Some("latest"), "1.2.0"));
        assert!(!launch_installs_marked_update(Some(""), "1.2.0"));
    }

    #[test]
    fn packages_owned_by_the_system_are_not_installed_by_us() {
        assert!(
            !installs_in_place(Some(BundleType::Deb)),
            "a deb belongs to dpkg and would need a password prompt"
        );
        assert!(!installs_in_place(Some(BundleType::Rpm)));
        assert!(installs_in_place(Some(BundleType::AppImage)));
        assert!(installs_in_place(Some(BundleType::Nsis)));
        assert!(
            installs_in_place(None),
            "an unpackaged binary is a developer's, updated in place"
        );
    }
}
