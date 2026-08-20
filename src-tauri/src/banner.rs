use crate::updates;
use crate::views::ErrorView;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

pub const BANNER: &str = "banner";
pub const MAIN: &str = "main";

const FIRST_PAINT_DEADLINE: Duration = Duration::from_secs(5);
const BANNER_DWELL: Duration = Duration::from_secs(1);

#[derive(Default)]
pub struct Handover {
    done_waiting_for_first_paint: bool,
    done_waiting_for_the_banner: bool,
    updating: bool,
    revealed: bool,
}

impl Handover {
    pub fn frontend_painted(&mut self) -> bool {
        self.done_waiting_for_first_paint = true;
        self.claim_the_single_reveal()
    }

    pub fn banner_dwelled(&mut self) -> bool {
        self.done_waiting_for_the_banner = true;
        self.claim_the_single_reveal()
    }

    pub fn update_started(&mut self) {
        self.updating = true;
    }

    pub fn update_finished(&mut self) -> bool {
        self.updating = false;
        self.claim_the_single_reveal()
    }

    pub fn watchdog_fired(&mut self) -> bool {
        self.done_waiting_for_first_paint = true;
        self.done_waiting_for_the_banner = true;
        self.claim_the_single_reveal()
    }

    fn claim_the_single_reveal(&mut self) -> bool {
        if self.revealed
            || !self.done_waiting_for_first_paint
            || !self.done_waiting_for_the_banner
            || self.updating
        {
            return false;
        }
        self.revealed = true;
        true
    }
}

#[derive(Default)]
pub struct BannerState(Mutex<Handover>);

pub fn open_windows(app: &tauri::AppHandle) -> tauri::Result<()> {
    let product = app.package_info().name.clone();

    open_banner(app)?;

    native_chrome(
        tauri::WebviewWindowBuilder::new(app, MAIN, tauri::WebviewUrl::default())
            .title(product)
            .inner_size(1400.0, 900.0)
            .min_inner_size(960.0, 600.0)
            .visible(false),
    )
    .build()?;

    Ok(())
}

fn open_banner(app: &tauri::AppHandle) -> tauri::Result<()> {
    banner_shadow(
        tauri::WebviewWindowBuilder::new(app, BANNER, tauri::WebviewUrl::App("banner.html".into()))
            .title(app.package_info().name.clone())
            .inner_size(260.0, 460.0)
            .decorations(false)
            .transparent(true)
            .resizable(false)
            .center()
            .skip_taskbar(true)
            .visible(false),
    )
    .build()?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn banner_shadow<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
) -> tauri::WebviewWindowBuilder<'a, R, M> {
    builder.shadow(true)
}

#[cfg(not(target_os = "macos"))]
fn banner_shadow<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
) -> tauri::WebviewWindowBuilder<'a, R, M> {
    builder.shadow(false)
}

pub fn show_banner_for_update(app: &tauri::AppHandle) -> Result<(), ErrorView> {
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.hide();
    }
    if app.get_webview_window(BANNER).is_none() {
        open_banner(app).map_err(|e| ErrorView::new("update.failed").detail(e.to_string()))?;
    }
    Ok(())
}

pub fn update_started(app: &tauri::AppHandle) {
    if let Ok(mut handover) = app.state::<BannerState>().0.lock() {
        handover.update_started();
    }
}

pub fn update_finished(app: &tauri::AppHandle) {
    reveal_main_if_the_handover_says_so(app, Handover::update_finished);
}

#[cfg(target_os = "macos")]
fn native_chrome<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
) -> tauri::WebviewWindowBuilder<'a, R, M> {
    builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
}

#[cfg(not(target_os = "macos"))]
fn native_chrome<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
) -> tauri::WebviewWindowBuilder<'a, R, M> {
    builder.decorations(false)
}

pub fn reveal_main(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.show();
        let _ = main.set_focus();
        open_devtools_in_debug(&main);
    }
    if let Some(banner) = app.get_webview_window(BANNER) {
        let _ = banner.destroy();
    }
}

#[cfg(debug_assertions)]
fn open_devtools_in_debug(main: &tauri::WebviewWindow) {
    main.open_devtools();
}

#[cfg(not(debug_assertions))]
fn open_devtools_in_debug(_main: &tauri::WebviewWindow) {}

fn reveal_main_if_the_handover_says_so(
    app: &tauri::AppHandle,
    step: impl FnOnce(&mut Handover) -> bool,
) {
    let told = match app.state::<BannerState>().0.lock() {
        Ok(mut handover) => step(&mut handover),
        Err(_) => false,
    };
    if told {
        reveal_main(app);
    }
}

#[tauri::command]
pub fn app_ready(app: tauri::AppHandle) {
    reveal_main_if_the_handover_says_so(&app, Handover::frontend_painted);
}

#[tauri::command]
pub fn banner_ready(app: tauri::AppHandle) {
    if let Some(banner) = app.get_webview_window(BANNER) {
        let _ = banner.show();
        let _ = banner.set_focus();
    }
    updates::replay_banner(&app);
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(BANNER_DWELL);
        reveal_main_if_the_handover_says_so(&app, Handover::banner_dwelled);
    });
}

pub fn reveal_main_when_the_frontend_stays_silent(app: tauri::AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(FIRST_PAINT_DEADLINE);
        reveal_main_if_the_handover_says_so(&app, Handover::watchdog_fired);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn painted() -> Handover {
        let mut handover = Handover::default();
        assert!(
            !handover.banner_dwelled(),
            "the banner alone reveals nothing"
        );
        handover
    }

    #[test]
    fn main_stays_hidden_until_the_frontend_reports_its_first_paint() {
        let mut handover = painted();
        assert!(
            handover.frontend_painted(),
            "the window the user waits for is revealed by the paint it was waiting for"
        );
    }

    #[test]
    fn a_frontend_that_paints_before_the_banner_has_dwelled_waits_for_the_banner() {
        let mut handover = Handover::default();
        assert!(
            !handover.frontend_painted(),
            "a banner destroyed the moment it appears is a flash, not a banner"
        );
        assert!(
            handover.banner_dwelled(),
            "once the banner has been seen for its dwell the painted window takes over"
        );
    }

    #[test]
    fn a_frontend_that_never_reports_is_revealed_by_the_watchdog() {
        let mut handover = Handover::default();
        assert!(
            handover.watchdog_fired(),
            "a frontend broken before its first paint would leave the app as a banner and nothing else"
        );
    }

    #[test]
    fn an_update_that_starts_first_holds_the_reveal_back_until_it_finishes() {
        let mut handover = painted();
        handover.update_started();
        assert!(
            !handover.frontend_painted(),
            "the banner is the only place the update is visible, so it must outlive the first paint"
        );
        assert!(
            handover.update_finished(),
            "once there is nothing left to show, the banner has no reason to stay"
        );
    }

    #[test]
    fn an_update_running_past_the_watchdog_still_holds_the_reveal_back() {
        let mut handover = Handover::default();
        handover.update_started();
        assert!(
            !handover.watchdog_fired(),
            "the deadline is on the frontend, not on the update it would interrupt"
        );
        assert!(handover.update_finished());
    }

    #[test]
    fn an_update_finishing_before_the_frontend_reports_reveals_nothing_yet() {
        let mut handover = painted();
        handover.update_started();
        assert!(
            !handover.update_finished(),
            "a main window shown before it has painted is a white rectangle"
        );
        assert!(handover.frontend_painted());
    }

    #[test]
    fn the_reveal_is_claimed_once_however_often_the_events_repeat() {
        let mut handover = painted();
        assert!(handover.frontend_painted());
        assert!(
            !handover.frontend_painted(),
            "a second reveal would show a window that is already open and close a banner that is gone"
        );
        assert!(!handover.watchdog_fired());
        assert!(!handover.banner_dwelled());
        handover.update_started();
        assert!(!handover.update_finished());
    }
}
