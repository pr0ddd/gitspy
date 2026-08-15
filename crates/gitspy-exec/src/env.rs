use std::collections::BTreeMap;
use std::path::Path;

pub const REMOVED: &[&str] = &[
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_NAMESPACE",
    "GIT_CONFIG",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_COUNT",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Environment {
    pub set: BTreeMap<String, String>,
    pub removed: Vec<String>,
}

pub fn environment(askpass: Option<&Path>) -> Environment {
    let mut set = BTreeMap::new();

    set.insert("GIT_TERMINAL_PROMPT".into(), "0".into());
    set.insert("GIT_EDITOR".into(), "true".into());
    set.insert("GIT_SEQUENCE_EDITOR".into(), "true".into());
    set.insert("GIT_PAGER".into(), "cat".into());
    set.insert("PAGER".into(), "cat".into());
    set.insert("GIT_FLUSH".into(), "1".into());
    set.insert("LC_ALL".into(), "C".into());
    set.insert("GIT_ADVICE".into(), "0".into());
    set.insert("GIT_OPTIONAL_LOCKS".into(), "0".into());

    match askpass {
        Some(helper) => {
            let path = helper.display().to_string();
            set.insert("GIT_ASKPASS".into(), path.clone());
            set.insert("SSH_ASKPASS".into(), path);
            set.insert("SSH_ASKPASS_REQUIRE".into(), "force".into());
            set.insert("DISPLAY".into(), ":0".into());
        }
        None => {
            set.insert("GIT_ASKPASS".into(), "echo".into());
            set.insert("SSH_ASKPASS".into(), "echo".into());
            set.insert("SSH_ASKPASS_REQUIRE".into(), "force".into());
        }
    }

    set.insert(
        "GIT_SSH_COMMAND".into(),
        "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new".into(),
    );

    Environment {
        set,
        removed: REMOVED.iter().map(|name| (*name).to_string()).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn git_never_asks_the_terminal() {
        let env = environment(None);
        assert_eq!(
            env.set.get("GIT_TERMINAL_PROMPT").map(String::as_str),
            Some("0")
        );
    }

    #[test]
    fn git_never_opens_an_editor_or_a_pager() {
        let env = environment(None);
        assert_eq!(env.set.get("GIT_EDITOR").map(String::as_str), Some("true"));
        assert_eq!(
            env.set.get("GIT_SEQUENCE_EDITOR").map(String::as_str),
            Some("true")
        );
        assert_eq!(env.set.get("GIT_PAGER").map(String::as_str), Some("cat"));
        assert_eq!(env.set.get("PAGER").map(String::as_str), Some("cat"));
    }

    #[test]
    fn reading_never_takes_the_index_lock() {
        let env = environment(None);
        assert_eq!(
            env.set.get("GIT_OPTIONAL_LOCKS").map(String::as_str),
            Some("0"),
            "git status обновляет индекс и на миллисекунды берёт index.lock; \
             попавший в это окно git add падает с «Unable to create index.lock»"
        );
    }

    #[test]
    fn credentials_go_through_our_helper_when_there_is_one() {
        let helper = PathBuf::from("/opt/gitspy/askpass");
        let env = environment(Some(&helper));
        assert_eq!(
            env.set.get("GIT_ASKPASS").map(String::as_str),
            Some("/opt/gitspy/askpass")
        );
        assert_eq!(
            env.set.get("SSH_ASKPASS").map(String::as_str),
            Some("/opt/gitspy/askpass")
        );
        assert_eq!(
            env.set.get("SSH_ASKPASS_REQUIRE").map(String::as_str),
            Some("force")
        );
    }

    #[test]
    fn ssh_does_not_fall_back_to_asking_a_human() {
        let env = environment(None);
        let command = env.set.get("GIT_SSH_COMMAND").expect("команда ssh задана");
        assert!(
            command.contains("BatchMode=yes"),
            "ssh не должен ждать ввода: {command}"
        );
    }

    #[test]
    fn the_repository_of_the_caller_never_leaks_in() {
        let env = environment(None);
        for name in ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"] {
            assert!(
                env.removed.iter().any(|removed| removed == name),
                "{name} обязан вычищаться: иначе операция уйдёт не в тот репозиторий"
            );
        }
    }

    #[test]
    fn messages_are_predictable_for_parsing() {
        assert_eq!(
            environment(None).set.get("LC_ALL").map(String::as_str),
            Some("C")
        );
    }
}
