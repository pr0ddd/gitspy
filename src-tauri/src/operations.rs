use gitspy_exec::{Cancel, Event, Git};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use ts_rs::TS;

#[derive(Debug, Clone, Deserialize, Serialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Operation {
    WriteCommitGraph,
    FetchDryRun,
    Fetch,
    Pull,
    Push,
    PushSetUpstream { remote: String, branch: String },
    Checkout { branch: String },
    Branch { name: String, checkout: bool },
    Stash { message: String },
    StashPop,
}

#[derive(Debug, Clone, Deserialize, Serialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PathOperation {
    Stage { paths: Vec<String> },
    Unstage { paths: Vec<String> },
    Discard { paths: Vec<String> },
    StageAll,
    UnstageAll,
}

impl PathOperation {
    pub fn args(&self) -> Vec<String> {
        let owned = |parts: &[&str]| parts.iter().map(|p| (*p).to_string()).collect::<Vec<_>>();
        match self {
            PathOperation::StageAll => owned(&["add", "-A"]),
            PathOperation::UnstageAll => owned(&["reset", "-q", "HEAD", "--"]),
            PathOperation::Stage { paths } => {
                let mut args = owned(&["add", "--"]);
                args.extend(paths.clone());
                args
            }
            PathOperation::Unstage { paths } => {
                let mut args = owned(&["reset", "-q", "HEAD", "--"]);
                args.extend(paths.clone());
                args
            }
            PathOperation::Discard { paths } => {
                let mut args = owned(&["checkout", "--"]);
                args.extend(paths.clone());
                args
            }
        }
    }
}

impl Operation {
    pub fn args(&self) -> Vec<String> {
        let owned = |parts: &[&str]| parts.iter().map(|p| (*p).to_string()).collect::<Vec<_>>();
        match self {
            Operation::WriteCommitGraph => owned(&["commit-graph", "write", "--reachable"]),
            Operation::FetchDryRun => owned(&["fetch", "--dry-run", "--all"]),
            Operation::Fetch => owned(&["fetch", "--all", "--progress"]),
            Operation::Pull => owned(&["pull", "--progress"]),
            Operation::Push => owned(&["push", "--progress"]),
            Operation::PushSetUpstream { remote, branch } => {
                let mut args = owned(&["push", "--progress", "--set-upstream"]);
                args.push(remote.clone());
                args.push(branch.clone());
                args
            }
            Operation::Checkout { branch } => {
                let mut args = owned(&["checkout"]);
                args.push(branch.clone());
                args
            }
            Operation::Branch { name, checkout } => {
                let mut args = owned(if *checkout {
                    &["checkout", "-b"]
                } else {
                    &["branch"]
                });
                args.push(name.clone());
                args
            }
            Operation::Stash { message } if message.trim().is_empty() => owned(&["stash", "push"]),
            Operation::Stash { message } => {
                let mut args = owned(&["stash", "push", "-m"]);
                args.push(message.clone());
                args
            }
            Operation::StashPop => owned(&["stash", "pop"]),
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Operation::WriteCommitGraph => "operation.writeCommitGraph",
            Operation::FetchDryRun => "operation.fetchDryRun",
            Operation::Fetch => "operation.fetch",
            Operation::Pull => "operation.pull",
            Operation::Push | Operation::PushSetUpstream { .. } => "operation.push",
            Operation::Checkout { .. } => "operation.checkout",
            Operation::Branch { .. } => "operation.branch",
            Operation::Stash { .. } => "operation.stash",
            Operation::StashPop => "operation.stashPop",
        }
    }

    pub fn reaches_the_network(&self) -> bool {
        matches!(
            self,
            Operation::FetchDryRun
                | Operation::Fetch
                | Operation::Pull
                | Operation::Push
                | Operation::PushSetUpstream { .. }
        )
    }
}

pub fn checkout_pull_commands(number: u32, branch: &str, from_fork: bool) -> Vec<Vec<String>> {
    let owned = |parts: &[&str]| parts.iter().map(|p| (*p).to_string()).collect::<Vec<_>>();
    if from_fork {
        vec![
            owned(&[
                "fetch",
                "origin",
                &format!("+pull/{number}/head:refs/heads/pr/{number}"),
            ]),
            owned(&["checkout", &format!("pr/{number}")]),
        ]
    } else {
        vec![owned(&["fetch", "origin"]), owned(&["checkout", branch])]
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Progress {
    #[serde(rename_all = "camelCase")]
    Started { operation: Operation, label: String },
    #[serde(rename_all = "camelCase")]
    Line { stderr: bool, text: String },
    #[serde(rename_all = "camelCase")]
    Finished { code: i32 },
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct OperationOutcome {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Default)]
pub struct Queue {
    lanes: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl Queue {
    pub fn lane(&self, repo: &str) -> Arc<Mutex<()>> {
        let mut lanes = self.lanes.lock().expect("очередь операций не отравлена");
        lanes.entry(repo.to_string()).or_default().clone()
    }
}

pub fn run(
    git: &Git,
    repo: &Path,
    operation: Operation,
    credential: Option<gitspy_exec::Credential<'_>>,
    cancel: &Cancel,
    progress: &mut dyn FnMut(Progress),
) -> Result<OperationOutcome, gitspy_exec::Error> {
    progress(Progress::Started {
        operation: operation.clone(),
        label: operation.label().to_string(),
    });

    let owned = operation.args();
    let args: Vec<&str> = owned.iter().map(String::as_str).collect();

    let outcome = git.run_as(repo, &args, credential, cancel, &mut |event| match event {
        Event::Line { stderr, text } => progress(Progress::Line { stderr, text }),
        Event::Finished { code } => progress(Progress::Finished { code }),
        Event::Started { .. } => {}
    })?;

    Ok(OperationOutcome {
        code: outcome.code,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fetch_does_not_prune_behind_the_users_back() {
        assert_eq!(
            Operation::Fetch.args(),
            ["fetch", "--all", "--progress"],
            "удаление отслеживающих ссылок настраивается в fetch.prune, а не нами"
        );
    }

    #[test]
    fn pull_carries_no_merge_flags_because_they_belong_to_the_config() {
        let args = Operation::Pull.args();
        assert!(
            !args
                .iter()
                .any(|a| a.contains("rebase") || a.contains("ff")),
            "подставленный флаг тихо меняет поведение, настроенное человеком"
        );
    }

    #[test]
    fn a_branch_without_an_upstream_gets_one_named_explicitly() {
        let push = Operation::PushSetUpstream {
            remote: "origin".to_string(),
            branch: "master".to_string(),
        };
        assert_eq!(
            push.args(),
            ["push", "--progress", "--set-upstream", "origin", "master"]
        );
    }

    #[test]
    fn no_operation_forces_a_push() {
        for operation in [
            Operation::Fetch,
            Operation::Pull,
            Operation::Push,
            Operation::PushSetUpstream {
                remote: "origin".to_string(),
                branch: "master".to_string(),
            },
        ] {
            assert!(
                !operation.args().iter().any(|a| a.starts_with("--force")),
                "кнопка, которая иногда делает force, однажды сотрёт чужую работу"
            );
        }
    }

    #[test]
    fn only_the_local_operation_goes_without_credentials() {
        assert!(!Operation::WriteCommitGraph.reaches_the_network());
        assert!(Operation::Fetch.reaches_the_network());
        assert!(Operation::Push.reaches_the_network());
    }
}

#[cfg(test)]
mod local_tests {
    use super::*;

    #[test]
    fn a_new_branch_switches_only_when_asked() {
        let stay = Operation::Branch {
            name: "тема".to_string(),
            checkout: false,
        };
        assert_eq!(stay.args(), ["branch", "тема"]);

        let go = Operation::Branch {
            name: "тема".to_string(),
            checkout: true,
        };
        assert_eq!(
            go.args(),
            ["checkout", "-b", "тема"],
            "иначе создание ветки молча уводит с текущей"
        );
    }

    #[test]
    fn a_stash_without_a_message_does_not_pass_an_empty_one() {
        let quiet = Operation::Stash {
            message: "  ".to_string(),
        };
        assert_eq!(
            quiet.args(),
            ["stash", "push"],
            "пустое -m сделало бы стеш без подписи вместо стеша по умолчанию"
        );
    }

    #[test]
    fn local_operations_never_carry_credentials() {
        for operation in [
            Operation::WriteCommitGraph,
            Operation::Checkout {
                branch: "master".to_string(),
            },
            Operation::Branch {
                name: "тема".to_string(),
                checkout: true,
            },
            Operation::Stash {
                message: String::new(),
            },
            Operation::StashPop,
        ] {
            assert!(
                !operation.reaches_the_network(),
                "{operation:?} не ходит в сеть, токен ему незачем"
            );
        }
    }
}

#[cfg(test)]
mod pull_tests {
    use super::*;

    #[test]
    fn a_fork_pull_lands_in_a_local_pr_branch() {
        let steps = checkout_pull_commands(37184, "fix/useoptimistic", true);
        assert_eq!(
            steps,
            vec![
                vec![
                    "fetch".to_string(),
                    "origin".to_string(),
                    "+pull/37184/head:refs/heads/pr/37184".to_string()
                ],
                vec!["checkout".to_string(), "pr/37184".to_string()],
            ],
            "ветки форка в origin нет, достижима только через pull/N/head"
        );
    }

    #[test]
    fn a_same_repository_pull_checks_out_the_real_branch() {
        let steps = checkout_pull_commands(7, "feature/x", false);
        assert_eq!(
            steps[1],
            vec!["checkout".to_string(), "feature/x".to_string()]
        );
        assert!(
            !steps.iter().flatten().any(|arg| arg.contains("pull/")),
            "с настоящей ветки можно пушить, копия pr/N этого не умеет"
        );
    }
}
