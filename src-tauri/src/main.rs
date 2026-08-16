#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

mod ai;
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
mod term;
mod term_batch;
mod terminal;
mod views;
mod watcher;

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
            repo_commands::favorite_repo,
            repo_commands::repo_passports,
            repo_commands::repository_root,
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
            repo_commands::found_commits,
            repo_commands::refresh_tip,
            avatars::avatar_paths,
            avatars::resolve_avatars,
            hosts::start_connect,
            hosts::connections,
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
            clone::template_catalog,
            clone::seed_repo,
            hosts::host_namespaces,
            hosts::host_create_repo,
            terminal::open_terminal,
            terminal::open_in_editor,
            terminal::open_url,
            state::set_autofetch_minutes,
            ai::ai_detect_server,
            ai::ai_generate_commit,
            term::term_open,
            term::term_input,
            term::term_resize,
            term::term_ack,
            term::term_kill
        ])
        .setup(|app| {
            autofetch::start(app.handle().clone());
            open_devtools_in_debug(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("the app starts up")
        .run(show_window_on_reopen)
}

#[cfg(debug_assertions)]
fn open_devtools_in_debug(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
    }
}

#[cfg(not(debug_assertions))]
fn open_devtools_in_debug(_app: &tauri::AppHandle) {}

#[cfg(target_os = "macos")]
fn show_window_on_reopen(app: &tauri::AppHandle, event: tauri::RunEvent) {
    use tauri::Manager;
    if let tauri::RunEvent::Reopen { .. } = event {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn show_window_on_reopen(_app: &tauri::AppHandle, _event: tauri::RunEvent) {}
