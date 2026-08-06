#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

mod autofetch;
mod avatars;
mod clone;
mod events;
mod hosts;
mod operations;
mod paths;
mod recent;
mod repo_commands;
mod state;
mod terminal;
mod views;
mod watcher;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(state::AppState::default())
        .manage(hosts::Hosts::default())
        .invoke_handler(tauri::generate_handler![
            repo_commands::open_repo,
            repo_commands::close_repo,
            repo_commands::open_repos,
            repo_commands::graph_window,
            repo_commands::worktrees,
            repo_commands::recent_repos,
            repo_commands::forget_repo,
            repo_commands::run_operation,
            repo_commands::commit_files,
            repo_commands::diff_sides,
            repo_commands::working_tree,
            repo_commands::working_tree_diff,
            repo_commands::conflict_file,
            repo_commands::working_tree_hunks,
            repo_commands::commit_file_hunks,
            repo_commands::append_ignore,
            repo_commands::open_path,
            repo_commands::reveal_path,
            repo_commands::remove_path,
            repo_commands::apply_hunk,
            repo_commands::write_file,
            repo_commands::file_history,
            repo_commands::blame_file,
            repo_commands::resolve_conflict,
            repo_commands::stage,
            repo_commands::commit,
            repo_commands::search_commits,
            repo_commands::refresh_tip,
            avatars::avatar_paths,
            avatars::resolve_avatars,
            hosts::start_connect,
            hosts::host_account,
            hosts::host_repos,
            hosts::disconnect_host,
            hosts::pull_requests,
            hosts::pull_card,
            repo_commands::checkout_pull,
            repo_commands::checkout_ref,
            clone::default_clone_dir,
            clone::clone_repo,
            clone::init_repo,
            terminal::open_terminal,
            terminal::open_in_editor,
            terminal::open_url,
            state::set_autofetch_minutes
        ])
        .setup(|app| {
            autofetch::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("приложение запускается")
        .run(|app, event| {
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
}
