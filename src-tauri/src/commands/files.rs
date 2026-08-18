use crate::views::ErrorView;
use std::path::{Path, PathBuf};

pub(crate) fn inside_repo(repo: &Path, path: &str) -> Result<PathBuf, ErrorView> {
    let joined = repo.join(path);
    let repo_root = repo.canonicalize().map_err(io_error)?;
    let full = joined.canonicalize().map_err(io_error)?;
    if !full.starts_with(&repo_root) {
        return Err(ErrorView {
            code: "repo.outsidePath".to_string(),
            params: std::collections::BTreeMap::new(),
            detail: Some(path.to_string()),
        });
    }
    Ok(full)
}

pub(crate) fn io_error(e: std::io::Error) -> ErrorView {
    ErrorView {
        code: "repo.io".to_string(),
        params: std::collections::BTreeMap::new(),
        detail: Some(e.to_string()),
    }
}

#[tauri::command]
pub fn append_ignore(repo: String, pattern: String) -> Result<(), ErrorView> {
    let file = PathBuf::from(&repo).join(".gitignore");
    let now = std::fs::read_to_string(&file).unwrap_or_default();
    let mut next = now.clone();
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(&pattern);
    next.push('\n');
    std::fs::write(&file, next).map_err(io_error)
}

#[tauri::command]
pub fn open_path(repo: String, path: String) -> Result<(), ErrorView> {
    let full = inside_repo(Path::new(&repo), &path)?;
    let status = if cfg!(target_os = "macos") {
        std::process::Command::new("open").arg(&full).status()
    } else if cfg!(target_os = "windows") {
        gitspy_exec::windowless_command("cmd")
            .args(["/c", "start", ""])
            .arg(&full)
            .status()
    } else {
        std::process::Command::new("xdg-open").arg(&full).status()
    };
    status.map(|_| ()).map_err(io_error)
}

#[tauri::command]
pub fn reveal_path(repo: String, path: String) -> Result<(), ErrorView> {
    let full = inside_repo(Path::new(&repo), &path)?;
    let status = if cfg!(target_os = "macos") {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&full)
            .status()
    } else if cfg!(target_os = "windows") {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", full.display()))
            .status()
    } else {
        let parent = full.parent().map(Path::to_path_buf).unwrap_or(full.clone());
        std::process::Command::new("xdg-open").arg(parent).status()
    };
    status.map(|_| ()).map_err(io_error)
}

#[tauri::command]
pub fn remove_path(repo: String, path: String) -> Result<(), ErrorView> {
    let full = inside_repo(Path::new(&repo), &path)?;
    std::fs::remove_file(full).map_err(io_error)
}
