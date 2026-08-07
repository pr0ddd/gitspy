use gitspy_exec::Git;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

fn executable(dir: &Path, name: &str, script: &str) -> PathBuf {
    let file = dir.join(name);
    std::fs::write(&file, script).expect("скрипт");
    std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755)).expect("права");
    file
}

#[test]
fn the_login_shell_decides_which_git_the_app_runs() {
    let dir = TempDir::new().expect("временный каталог");
    let fake_git = executable(dir.path(), "special-git", "#!/bin/sh\nexit 0\n");
    let shell = executable(
        dir.path(),
        "shell",
        &format!("#!/bin/sh\necho {}\n", fake_git.display()),
    );

    let git = Git::found_by_the_login_shell(&shell).expect("шелл называет свой git");
    assert_eq!(
        git.program(),
        fake_git,
        "приложение из Finder обязано запускать тот же git, что видит терминал пользователя, иначе они расходятся в версиях и строгости"
    );
}

#[test]
fn a_silent_login_shell_leaves_discovery_to_the_path() {
    let dir = TempDir::new().expect("временный каталог");
    let mute = executable(dir.path(), "shell", "#!/bin/sh\nexit 1\n");
    assert!(
        Git::found_by_the_login_shell(&mute).is_none(),
        "молчание шелла — не приговор: дальше ищем git по PATH как раньше"
    );
}
