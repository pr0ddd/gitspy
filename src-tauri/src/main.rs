#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

mod ai;
mod autofetch;
mod avatars;
mod clone;
mod commands;
mod events;
mod hosts;
mod operations;
mod paths;
mod recent;
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
            commands::open_repo,
            commands::close_repo,
            commands::open_repos,
            commands::graph_window,
            commands::worktrees,
            commands::recent_repos,
            commands::forget_repo,
            commands::favorite_repo,
            commands::repo_passports,
            commands::repository_root,
            commands::run_operation,
            commands::commit_files,
            commands::diff_sides,
            commands::working_tree,
            commands::working_tree_diff,
            commands::conflict_file,
            commands::working_tree_hunks,
            commands::commit_file_hunks,
            commands::append_ignore,
            commands::open_path,
            commands::reveal_path,
            commands::remove_path,
            commands::apply_hunk,
            commands::write_file,
            commands::file_history,
            commands::blame_file,
            commands::resolve_conflict,
            commands::stage,
            commands::commit,
            commands::search_commits,
            commands::found_commits,
            commands::refresh_tip,
            avatars::avatar_paths,
            avatars::resolve_avatars,
            hosts::start_connect,
            hosts::connections,
            hosts::host_account,
            hosts::host_repos,
            hosts::disconnect_host,
            hosts::pull_requests,
            hosts::pull_card,
            commands::checkout_pull,
            commands::checkout_ref,
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
