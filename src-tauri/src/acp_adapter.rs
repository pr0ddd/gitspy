use crate::views::ErrorView;
use std::path::{Path, PathBuf};
use std::process::Command;

const PACKAGE: &str = "@agentclientprotocol/claude-agent-acp";

pub struct Launch {
    pub program: String,
    pub args: Vec<String>,
}

pub fn entry_inside(home: &Path) -> PathBuf {
    home.join("node_modules")
        .join("@agentclientprotocol")
        .join("claude-agent-acp")
        .join("dist")
        .join("index.js")
}

pub fn install_args(home: &Path) -> Vec<String> {
    vec![
        "install".to_owned(),
        "--prefix".to_owned(),
        home.to_string_lossy().into_owned(),
        "--no-audit".to_owned(),
        "--no-fund".to_owned(),
        "--omit=optional".to_owned(),
        PACKAGE.to_owned(),
    ]
}

pub fn launch_of(entry: &Path) -> Launch {
    Launch {
        program: "node".to_owned(),
        args: vec![entry.to_string_lossy().into_owned()],
    }
}

fn install_into(home: &Path) -> Result<(), String> {
    std::fs::create_dir_all(home).map_err(|e| e.to_string())?;
    let done = Command::new("npm")
        .args(install_args(home))
        .current_dir(home)
        .output()
        .map_err(|e| e.to_string())?;
    if done.status.success() {
        return Ok(());
    }
    Err(String::from_utf8_lossy(&done.stderr).trim().to_owned())
}

pub fn ready_adapter(home: &Path) -> Result<Launch, ErrorView> {
    let entry = entry_inside(home);
    if entry.is_file() {
        return Ok(launch_of(&entry));
    }
    install_into(home).map_err(|detail| ErrorView::new("acp.install").detail(detail))?;
    if entry.is_file() {
        return Ok(launch_of(&entry));
    }
    Err(ErrorView::new("acp.install").detail(format!("{} missing after install", entry.display())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adapter_lives_under_our_own_directory() {
        let entry = entry_inside(Path::new("/data/gitspy/acp"));
        assert_eq!(
            entry,
            PathBuf::from(
                "/data/gitspy/acp/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js"
            ),
            "адаптер ставится рядом с приложением, а не разыскивается в кеше npx"
        );
    }

    #[test]
    fn a_present_adapter_is_launched_by_node_without_a_package_manager() {
        let launch = launch_of(Path::new("/data/acp/dist/index.js"));
        assert_eq!(
            (launch.program.as_str(), launch.args.len()),
            ("node", 1),
            "запуск идёт прямо через node: npx стоил лишнюю секунду на каждой сессии"
        );
    }

    #[test]
    fn install_pins_itself_to_our_directory_and_skips_platform_extras() {
        let args = install_args(Path::new("/data/acp"));
        assert!(
            args.windows(2)
                .any(|pair| pair == ["--prefix".to_owned(), "/data/acp".to_owned()]),
            "установка обязана лечь в наш каталог, а не в проект пользователя: {args:?}"
        );
        assert!(
            args.contains(&"--omit=optional".to_owned()),
            "платформенный бинарь claude нам не нужен — мы запускаем подписанный claude пользователя"
        );
        assert!(
            args.last().is_some_and(|last| last == PACKAGE),
            "ставим именно адаптер: {args:?}"
        );
    }
}
