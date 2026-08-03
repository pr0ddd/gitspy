use crate::views::ErrorView;
use std::path::Path;
use std::process::Command;

#[cfg(target_os = "macos")]
fn spawn(path: &Path) -> std::io::Result<()> {
    Command::new("open")
        .arg("-a")
        .arg("Terminal")
        .arg(path)
        .spawn()
        .map(|_| ())
}

#[cfg(target_os = "linux")]
fn spawn(path: &Path) -> std::io::Result<()> {
    for program in ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"] {
        if Command::new(program).current_dir(path).spawn().is_ok() {
            return Ok(());
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "terminal",
    ))
}

#[cfg(target_os = "windows")]
fn spawn(path: &Path) -> std::io::Result<()> {
    Command::new("cmd")
        .args(["/C", "start", "cmd"])
        .current_dir(path)
        .spawn()
        .map(|_| ())
}

#[tauri::command]
pub fn open_in_editor(app: tauri::AppHandle, path: String) -> Result<(), ErrorView> {
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_path(&path, None::<&str>)
        .map_err(|e| ErrorView::new("editor.failed").detail(e.to_string()))
}

#[tauri::command]
pub fn open_terminal(repo: String) -> Result<(), ErrorView> {
    spawn(Path::new(&repo)).map_err(|e| ErrorView::new("terminal.failed").detail(e.to_string()))
}
