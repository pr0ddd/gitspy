use crate::{Cancel, Error, Git};
use std::io::ErrorKind;
use std::path::Path;

const LABEL: &str = "gitspy-checkpoint";

fn runner() -> Result<Git, String> {
    Git::discover().map_err(|e| e.to_string())
}

fn ask_git(git: &Git, repo: &Path, args: &[&str]) -> Result<String, Error> {
    git.run(repo, args, &Cancel::new(), &mut |_| {})
        .map(|outcome| outcome.stdout)
}

fn checkpoint_ref(session: &str, n: u32) -> String {
    format!("refs/gitspy/checkpoints/{session}/{n}")
}

fn the_snapshot_never_had_this_path(error: &Error) -> bool {
    match error {
        Error::Failed { stderr, .. } => stderr.contains("did not match any file"),
        _ => false,
    }
}

fn drop_file_no_snapshot_holds(repo: &Path, path: &str) -> Result<(), String> {
    match std::fs::remove_file(repo.join(path)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn checkpoint_create(repo: &Path) -> Result<Option<String>, String> {
    let git = runner()?;
    let printed = ask_git(&git, repo, &["stash", "create", LABEL]).map_err(|e| e.to_string())?;
    let oid = printed.trim();
    Ok((!oid.is_empty()).then(|| oid.to_string()))
}

pub fn checkpoint_pin(repo: &Path, session: &str, n: u32, oid: &str) -> Result<(), String> {
    let git = runner()?;
    let name = checkpoint_ref(session, n);
    ask_git(&git, repo, &["update-ref", &name, oid])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn checkpoint_restore(repo: &Path, oid: Option<&str>, paths: &[String]) -> Result<(), String> {
    let git = runner()?;
    let Some(oid) = oid else {
        return paths
            .iter()
            .try_for_each(|path| drop_file_no_snapshot_holds(repo, path));
    };

    let source = format!("--source={oid}");
    for path in paths {
        match ask_git(&git, repo, &["restore", &source, "--worktree", "--", path]) {
            Ok(_) => {}
            Err(e) if the_snapshot_never_had_this_path(&e) => {
                drop_file_no_snapshot_holds(repo, path)?
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}
