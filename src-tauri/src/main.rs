#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
            clone::default_clone_dir,
            clone::clone_repo,
            clone::init_repo,
            terminal::open_terminal,
            terminal::open_in_editor
        ])
        .run(tauri::generate_context!())
        .expect("приложение запускается")
}
