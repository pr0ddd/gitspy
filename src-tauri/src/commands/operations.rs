use crate::hosts;
use crate::operations::{self, Operation, OperationOutcome, Progress};
use crate::state::{exec_error, on_reader, with_repo, AppState};
use crate::views::ErrorView;
use gitspy_exec::Cancel;
use std::path::PathBuf;
use tauri::ipc::Channel;
use tauri::State;

#[tauri::command]
pub async fn run_operation(
    repo: String,
    operation: Operation,
    progress: Channel<Progress>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<OperationOutcome, ErrorView> {
    state.cancel_autofetch(&repo);

    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let path = PathBuf::from(&repo);

    let wants_network = operation.reaches_the_network();
    let credential_app = app.clone();

    let outcome = on_reader(move || {
        let _held = lane.lock().expect("the queue lane is not poisoned");
        let owned = wants_network
            .then(|| hosts::credential_for(&credential_app, &git.remote_urls(&path)))
            .flatten();
        let credential = owned.as_ref().map(|c| gitspy_exec::Credential {
            url: &c.url,
            username: c.username,
            token: &c.token,
        });

        operations::run(
            &git,
            &path,
            operation,
            credential,
            &Cancel::new(),
            &mut |event| {
                let _ = progress.send(event);
            },
        )
        .map_err(exec_error)
    })
    .await?;

    state.mark_stale(&repo);
    Ok(outcome)
}

#[tauri::command]
pub async fn checkout_pull(
    repo: String,
    number: u32,
    branch: String,
    from_fork: bool,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), ErrorView> {
    let git = state.git()?;
    let lane = state.queue.lane(&repo);
    let path = PathBuf::from(&repo);
    let credential_app = app.clone();

    on_reader(move || {
        let _held = lane.lock().expect("the queue lane is not poisoned");
        let owned = hosts::credential_for(&credential_app, &git.remote_urls(&path));
        let credential = owned.as_ref().map(|c| gitspy_exec::Credential {
            url: &c.url,
            username: c.username,
            token: &c.token,
        });

        for step in operations::checkout_pull_commands(number, &branch, from_fork) {
            let borrowed: Vec<&str> = step.iter().map(String::as_str).collect();
            git.run_as(&path, &borrowed, credential, &Cancel::new(), &mut |_| {})
                .map_err(exec_error)?;
        }
        Ok(())
    })
    .await?;

    state.mark_stale(&repo);
    Ok(())
}

#[tauri::command]
pub async fn checkout_ref(
    repo: String,
    name: String,
    kind: crate::views::RefKindView,
    state: State<'_, AppState>,
) -> Result<(), ErrorView> {
    let locals = with_repo(&state, &repo, |open| {
        open.view
            .refs
            .iter()
            .filter(|r| r.kind == crate::views::RefKindView::LocalBranch)
            .map(|r| r.name.clone())
            .collect::<Vec<_>>()
    })?;

    let git = state.git()?;
    let path = PathBuf::from(&repo);
    let remotes = git.remotes(&path);

    let Some(operation) = operations::checkout_for(&name, kind, &locals, &remotes) else {
        return Ok(());
    };

    state.cancel_autofetch(&repo);
    let lane = state.queue.lane(&repo);
    on_reader(move || {
        let _held = lane.lock().expect("the queue lane is not poisoned");
        operations::run(&git, &path, operation, None, &Cancel::new(), &mut |_| {})
            .map_err(exec_error)
            .map(|_| ())
    })
    .await?;

    state.mark_stale(&repo);
    Ok(())
}
