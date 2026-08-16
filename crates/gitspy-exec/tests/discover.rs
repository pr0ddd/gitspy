#![cfg(unix)]

use gitspy_exec::Git;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

fn executable(dir: &Path, name: &str, script: &str) -> PathBuf {
    let file = dir.join(name);
    std::fs::write(&file, script).expect("script written");
    std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755))
        .expect("permissions set");
    file
}

#[test]
fn the_login_shell_decides_which_git_the_app_runs() {
    let dir = TempDir::new().expect("temp directory");
    let fake_git = executable(dir.path(), "special-git", "#!/bin/sh\nexit 0\n");
    let shell = executable(
        dir.path(),
        "shell",
        &format!("#!/bin/sh\necho {}\n", fake_git.display()),
    );

    let git = Git::found_by_the_login_shell(&shell).expect("the shell names its own git");
    assert_eq!(
        git.program(),
        fake_git,
        "launched from Finder the app has to run the same git the user's terminal sees, otherwise the two disagree on version and strictness"
    );
}

#[test]
fn a_silent_login_shell_leaves_discovery_to_the_path() {
    let dir = TempDir::new().expect("temp directory");
    let mute = executable(dir.path(), "shell", "#!/bin/sh\nexit 1\n");
    assert!(
        Git::found_by_the_login_shell(&mute).is_none(),
        "a silent shell is not a verdict: discovery falls back to looking for git on PATH as before"
    );
}
