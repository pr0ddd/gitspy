use crate::hosts;
use crate::state::{exec_error, AppState};
use crate::views::{build_clone_step, CloneStepView, ErrorView};
use gitspy_exec::Cancel;
use std::path::PathBuf;
use tauri::ipc::Channel;
use tauri::{Manager, State};

#[tauri::command]
pub fn default_clone_dir(app: tauri::AppHandle) -> Result<String, ErrorView> {
    let parent = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| ErrorView::new("clone.noDirectory").detail(e.to_string()))?;
    Ok(parent.join("gitspy").display().to_string())
}

#[tauri::command]
pub async fn clone_repo(
    url: String,
    parent: String,
    name: String,
    shallow: bool,
    progress: Channel<CloneStepView>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, ErrorView> {
    let git = state.git()?;
    let into = PathBuf::from(&parent).join(name.trim());

    if into.exists() {
        return Err(ErrorView::new("clone.exists").param("path", into.display()));
    }

    let owned = hosts::credential_for(&app, &[("origin".to_string(), url.clone())]);
    let destination = into.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let credential = owned.as_ref().map(|c| gitspy_exec::Credential {
            url: &c.url,
            username: c.username,
            token: &c.token,
        });

        git.clone_into(
            &url,
            &destination,
            shallow,
            credential,
            &Cancel::new(),
            &mut |step| {
                let _ = progress.send(build_clone_step(step));
            },
        )
        .map_err(exec_error)
    })
    .await
    .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))??;

    Ok(into.display().to_string())
}

#[tauri::command]
pub async fn init_repo(
    path: String,
    branch: Option<String>,
    gitignore: Option<String>,
    license: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, ErrorView> {
    let git = state.git()?;
    let at = PathBuf::from(&path);

    if at.join(".git").exists() {
        return Err(ErrorView::new("init.taken").param("path", &path));
    }

    let mut seeds: Vec<(&str, String)> = Vec::new();
    if gitignore.is_some() || license.is_some() {
        let templates = gitspy_hosts::templates::Templates::new().map_err(crate::hosts::host_error)?;
        let token = crate::hosts::token(&app, "github");
        if let Some(name) = gitignore.as_deref() {
            seeds.push((
                ".gitignore",
                templates
                    .gitignore_source(name, token.as_deref())
                    .await
                    .map_err(crate::hosts::host_error)?,
            ));
        }
        if let Some(key) = license.as_deref() {
            seeds.push((
                "LICENSE",
                templates
                    .license_body(key, token.as_deref())
                    .await
                    .map_err(crate::hosts::host_error)?,
            ));
        }
    }

    tauri::async_runtime::spawn_blocking(move || {
        git.init(&at, branch.as_deref()).map_err(exec_error)?;
        if seeds.is_empty() {
            return Ok(());
        }
        for (file, content) in &seeds {
            std::fs::write(at.join(file), content)
                .map_err(|e| ErrorView::new("init.seed").detail(e.to_string()))?;
        }
        git.first_commit(&at, "Initial commit").map_err(exec_error)
    })
        .await
        .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))??;

    Ok(path)
}

#[derive(serde::Serialize, Clone, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/generated/")]
pub struct TemplateCatalogView {
    pub gitignores: Vec<String>,
    pub licenses: Vec<LicenseView>,
}

#[derive(serde::Serialize, Clone, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/generated/")]
pub struct LicenseView {
    pub key: String,
    pub name: String,
}

#[tauri::command]
pub async fn template_catalog(
    app: tauri::AppHandle,
) -> Result<TemplateCatalogView, ErrorView> {
    {
        let known = KNOWN_CATALOG.lock().expect("каталог не отравлен");
        if let Some(found) = known.as_ref() {
            return Ok(found.clone());
        }
    }
    let token = crate::hosts::token(&app, "github");
    let templates = gitspy_hosts::templates::Templates::new().map_err(crate::hosts::host_error)?;
    let gitignores = templates
        .gitignore_names(token.as_deref())
        .await
        .map_err(crate::hosts::host_error)?;
    let licenses: Vec<LicenseView> = templates
        .licenses(token.as_deref())
        .await
        .map_err(crate::hosts::host_error)?
        .into_iter()
        .map(|l| LicenseView {
            key: l.key,
            name: l.name,
        })
        .collect();
    let catalog = TemplateCatalogView {
        gitignores,
        licenses,
    };
    *KNOWN_CATALOG.lock().expect("каталог не отравлен") = Some(catalog.clone());
    Ok(catalog)
}

static KNOWN_CATALOG: std::sync::Mutex<Option<TemplateCatalogView>> = std::sync::Mutex::new(None);

#[tauri::command]
pub async fn seed_repo(
    path: String,
    branch: Option<String>,
    gitignore: Option<String>,
    license: Option<String>,
    push: bool,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), ErrorView> {
    let git = state.git()?;
    let at = PathBuf::from(&path);

    let mut seeds: Vec<(&str, String)> = Vec::new();
    if gitignore.is_some() || license.is_some() {
        let templates =
            gitspy_hosts::templates::Templates::new().map_err(crate::hosts::host_error)?;
        let token = crate::hosts::token(&app, "github");
        if let Some(name) = gitignore.as_deref() {
            seeds.push((
                ".gitignore",
                templates
                    .gitignore_source(name, token.as_deref())
                    .await
                    .map_err(crate::hosts::host_error)?,
            ));
        }
        if let Some(key) = license.as_deref() {
            seeds.push((
                "LICENSE",
                templates
                    .license_body(key, token.as_deref())
                    .await
                    .map_err(crate::hosts::host_error)?,
            ));
        }
    }
    if seeds.is_empty() {
        return Ok(());
    }

    let credential_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(name) = branch.as_deref().filter(|b| !b.trim().is_empty()) {
            git.rename_unborn_branch(&at, name).map_err(exec_error)?;
        }
        for (file, content) in &seeds {
            std::fs::write(at.join(file), content)
                .map_err(|e| ErrorView::new("init.seed").detail(e.to_string()))?;
        }
        git.first_commit(&at, "Initial commit").map_err(exec_error)?;

        if push {
            let owned = crate::hosts::credential_for(&credential_app, &git.remote_urls(&at));
            let credential = owned.as_ref().map(|c| gitspy_exec::Credential {
                url: &c.url,
                username: c.username,
                token: &c.token,
            });
            git.run_as(
                &at,
                &["push", "-u", "origin", "HEAD"],
                credential,
                &gitspy_exec::Cancel::new(),
                &mut |_| {},
            )
            .map_err(exec_error)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| ErrorView::new("app.readerThread").detail(e.to_string()))?
}
