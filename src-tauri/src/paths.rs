use crate::views::ErrorView;
use std::path::PathBuf;
use tauri::Manager;

pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, ErrorView> {
    app.path()
        .app_data_dir()
        .map_err(|e| ErrorView::new("app.dataDir").detail(e.to_string()))
}
