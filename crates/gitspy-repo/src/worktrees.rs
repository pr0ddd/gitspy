use crate::model::Error;
use std::path::Path;

fn checked_out_branch(repo: &gix::Repository) -> Option<String> {
    repo.head_ref()
        .ok()
        .flatten()
        .map(|r| r.name().as_bstr().to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
    pub is_locked: bool,
}

pub fn worktrees(path: &Path) -> Result<Vec<WorktreeInfo>, Error> {
    let repo = gix::open(path).map_err(|e| Error::OpenRepo {
        path: path.display().to_string(),
        detail: e.to_string(),
    })?;

    let mut found = Vec::new();
    if let Some(main) = repo.workdir() {
        found.push(WorktreeInfo {
            name: main
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| main.display().to_string()),
            path: main.display().to_string(),
            branch: checked_out_branch(&repo).and_then(short_branch_name),
            is_main: true,
            is_locked: false,
        });
    }

    let Ok(linked) = repo.worktrees() else {
        return Ok(found);
    };
    for proxy in linked {
        let name = proxy.id().to_string();
        let base = proxy.base().ok();
        let is_locked = proxy.is_locked();
        let branch = proxy
            .into_repo_with_possibly_inaccessible_worktree()
            .ok()
            .and_then(|r| checked_out_branch(&r))
            .and_then(short_branch_name);

        found.push(WorktreeInfo {
            name,
            path: base.map(|p| p.display().to_string()).unwrap_or_default(),
            branch,
            is_main: false,
            is_locked,
        });
    }
    Ok(found)
}

fn short_branch_name(full: String) -> Option<String> {
    full.strip_prefix("refs/heads/").map(str::to_string)
}
