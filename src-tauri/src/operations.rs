use crate::views::RefKindView;
use gitspy_exec::{Cancel, Event, Git};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum ResetMode {
    Soft,
    Mixed,
    Hard,
}

#[derive(Debug, Clone, Deserialize, Serialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Operation {
    WriteCommitGraph,
    FetchDryRun,
    Fetch,
    Pull,
    Push,
    PushSetUpstream {
        remote: String,
        branch: String,
    },
    Checkout {
        branch: String,
    },
    CheckoutTracking {
        upstream: String,
        local: String,
    },
    Branch {
        name: String,
        checkout: bool,
    },
    BranchAt {
        name: String,
        hash: String,
    },
    BranchDelete {
        name: String,
    },
    BranchRename {
        from: String,
        to: String,
    },
    AmendMessage {
        message: String,
    },
    Merge {
        branch: String,
    },
    MergeAbort,
    MergeContinue,
    Rebase {
        onto: String,
    },
    CherryPick {
        hash: String,
    },
    Revert {
        hash: String,
    },
    Drop {
        hash: String,
    },
    Reset {
        hash: String,
        mode: ResetMode,
    },
    TagAt {
        name: String,
        hash: String,
    },
    AnnotatedTagAt {
        name: String,
        message: String,
        hash: String,
    },
    WorktreeAdd {
        path: String,
        at: String,
    },
    FetchInto {
        remote: String,
        from: String,
        into: String,
    },
    PushBranch {
        remote: String,
        branch: String,
    },
    PushDelete {
        remote: String,
        branch: String,
    },
    Stash {
        message: String,
    },
    StashPop,
}

#[derive(Debug, Clone, Deserialize, Serialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PathOperation {
    Stage { paths: Vec<String> },
    Unstage { paths: Vec<String> },
    Unresolve { paths: Vec<String> },
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
            PathOperation::Unresolve { paths } => {
                let mut args = owned(&["checkout", "-m", "--"]);
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
            Operation::Pull => owned(&["pull", "--no-edit", "--progress"]),
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
            Operation::CheckoutTracking { upstream, local } => {
                let mut args = owned(&["checkout", "-b"]);
                args.push(local.clone());
                args.push("--track".to_string());
                args.push(upstream.clone());
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
            Operation::BranchAt { name, hash } => {
                let mut args = owned(&["branch"]);
                args.push(name.clone());
                args.push(hash.clone());
                args
            }
            Operation::BranchDelete { name } => {
                let mut args = owned(&["branch", "-d"]);
                args.push(name.clone());
                args
            }
            Operation::BranchRename { from, to } => {
                let mut args = owned(&["branch", "-m"]);
                args.push(from.clone());
                args.push(to.clone());
                args
            }
            Operation::AmendMessage { message } => {
                let mut args = owned(&["commit", "--amend", "--only", "-m"]);
                args.push(message.clone());
                args
            }
            Operation::Merge { branch } => {
                let mut args = owned(&["merge", "--no-edit"]);
                args.push(branch.clone());
                args
            }
            Operation::MergeAbort => owned(&["merge", "--abort"]),
            Operation::MergeContinue => owned(&["commit", "--no-edit"]),
            Operation::Rebase { onto } => {
                let mut args = owned(&["rebase"]);
                args.push(onto.clone());
                args
            }
            Operation::CherryPick { hash } => {
                let mut args = owned(&["cherry-pick"]);
                args.push(hash.clone());
                args
            }
            Operation::Revert { hash } => {
                let mut args = owned(&["revert", "--no-edit"]);
                args.push(hash.clone());
                args
            }
            Operation::Reset { hash, mode } => {
                let flag = match mode {
                    ResetMode::Soft => "--soft",
                    ResetMode::Mixed => "--mixed",
                    ResetMode::Hard => "--hard",
                };
                let mut args = owned(&["reset", flag]);
                args.push(hash.clone());
                args
            }
            Operation::TagAt { name, hash } => {
                let mut args = owned(&["tag"]);
                args.push(name.clone());
                args.push(hash.clone());
                args
            }
            Operation::Drop { hash } => {
                let mut args = owned(&["rebase", "--onto"]);
                args.push(format!("{hash}^"));
                args.push(hash.clone());
                args
            }
            Operation::AnnotatedTagAt {
                name,
                message,
                hash,
            } => {
                let mut args = owned(&["tag", "-a"]);
                args.push(name.clone());
                args.push("-m".to_string());
                args.push(message.clone());
                args.push(hash.clone());
                args
            }
            Operation::WorktreeAdd { path, at } => {
                let mut args = owned(&["worktree", "add"]);
                args.push(path.clone());
                args.push(at.clone());
                args
            }
            Operation::FetchInto { remote, from, into } => {
                let mut args = owned(&["fetch"]);
                args.push(remote.clone());
                args.push(format!("{from}:{into}"));
                args
            }
            Operation::PushBranch { remote, branch } => {
                let mut args = owned(&["push", "--progress"]);
                args.push(remote.clone());
                args.push(branch.clone());
                args
            }
            Operation::PushDelete { remote, branch } => {
                let mut args = owned(&["push"]);
                args.push(remote.clone());
                args.push("--delete".to_string());
                args.push(branch.clone());
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
            Operation::Checkout { .. } | Operation::CheckoutTracking { .. } => "operation.checkout",
            Operation::Branch { .. } | Operation::BranchAt { .. } => "operation.branch",
            Operation::BranchDelete { .. } => "operation.branchDelete",
            Operation::BranchRename { .. } => "operation.branchRename",
            Operation::AmendMessage { .. } => "operation.amend",
            Operation::Merge { .. } => "operation.merge",
            Operation::MergeAbort => "operation.mergeAbort",
            Operation::MergeContinue => "operation.mergeContinue",
            Operation::Rebase { .. } => "operation.rebase",
            Operation::CherryPick { .. } => "operation.cherryPick",
            Operation::Revert { .. } => "operation.revert",
            Operation::Drop { .. } => "operation.drop",
            Operation::Reset { .. } => "operation.reset",
            Operation::TagAt { .. } | Operation::AnnotatedTagAt { .. } => "operation.tag",
            Operation::WorktreeAdd { .. } => "operation.worktreeAdd",
            Operation::FetchInto { remote, .. } if remote == "." => "operation.fastForward",
            Operation::FetchInto { .. } => "operation.fetch",
            Operation::PushBranch { .. } => "operation.push",
            Operation::PushDelete { .. } => "operation.pushDelete",
            Operation::Stash { .. } => "operation.stash",
            Operation::StashPop => "operation.stashPop",
        }
    }

    pub fn reaches_the_network(&self) -> bool {
        match self {
            Operation::FetchDryRun
            | Operation::Fetch
            | Operation::Pull
            | Operation::Push
            | Operation::PushSetUpstream { .. }
            | Operation::PushBranch { .. }
            | Operation::PushDelete { .. } => true,
            Operation::FetchInto { remote, .. } => remote != ".",
            _ => false,
        }
    }
}

pub fn checkout_for(
    name: &str,
    kind: RefKindView,
    locals: &[String],
    remotes: &[String],
) -> Option<Operation> {
    match kind {
        RefKindView::LocalBranch => Some(Operation::Checkout {
            branch: name.to_string(),
        }),
        RefKindView::RemoteBranch => {
            let local = remotes
                .iter()
                .filter_map(|remote| name.strip_prefix(&format!("{remote}/")))
                .min_by_key(|rest| rest.len())?
                .to_string();

            if locals.iter().any(|existing| existing == &local) {
                return Some(Operation::Checkout { branch: local });
            }
            Some(Operation::CheckoutTracking {
                upstream: name.to_string(),
                local,
            })
        }
        RefKindView::Tag | RefKindView::Stash => None,
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

pub fn commit_args(message: &str, amend: bool) -> Vec<String> {
    let mut args = vec!["commit".to_string()];
    if amend {
        args.push("--amend".to_string());
    }
    args.push("-m".to_string());
    args.push(message.to_string());
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_commit_is_just_a_message() {
        assert_eq!(
            commit_args("fix: thing", false),
            ["commit", "-m", "fix: thing"]
        );
    }

    #[test]
    fn a_clean_pull_commits_its_merge_without_asking_the_neutered_editor() {
        assert_eq!(
            Operation::Pull.args(),
            ["pull", "--no-edit", "--progress"],
            "без --no-edit git зовёт редактор, которого нет, и бросает слияние незавершённым"
        );
    }

    #[test]
    fn finishing_a_merge_keeps_the_prepared_message_and_the_neutered_editor_closed() {
        assert_eq!(Operation::MergeAbort.args(), ["merge", "--abort"]);
        assert_eq!(
            Operation::MergeContinue.args(),
            ["commit", "--no-edit"],
            "git сам приготовил MERGE_MSG, а редактор у нас обезврежен — берём сообщение как есть"
        );
        assert_eq!(Operation::MergeAbort.label(), "operation.mergeAbort");
        assert_eq!(Operation::MergeContinue.label(), "operation.mergeContinue");
        assert!(!Operation::MergeAbort.reaches_the_network());
        assert!(!Operation::MergeContinue.reaches_the_network());
    }

    #[test]
    fn unresolving_a_file_restores_the_conflict_instead_of_resetting_to_head() {
        assert_eq!(
            PathOperation::Unresolve {
                paths: vec!["a.ts".into()]
            }
            .args(),
            ["checkout", "-m", "--", "a.ts"],
            "git reset тут стирает стадии слияния навсегда, а checkout -m их возвращает"
        );
    }

    #[test]
    fn history_surgery_operations_speak_plain_git() {
        let hash = "abc123".to_string();
        assert_eq!(
            Operation::CherryPick { hash: hash.clone() }.args(),
            ["cherry-pick", "abc123"]
        );
        assert_eq!(
            Operation::Revert { hash: hash.clone() }.args(),
            ["revert", "--no-edit", "abc123"],
            "редактор обезврежен, сообщение ревёрта должно собраться без него"
        );
        assert_eq!(
            Operation::Reset {
                hash: hash.clone(),
                mode: ResetMode::Hard
            }
            .args(),
            ["reset", "--hard", "abc123"]
        );
        assert_eq!(
            Operation::Reset {
                hash,
                mode: ResetMode::Soft
            }
            .args(),
            ["reset", "--soft", "abc123"]
        );
    }

    #[test]
    fn branch_bookkeeping_operations_speak_plain_git() {
        assert_eq!(
            Operation::BranchAt {
                name: "fix".into(),
                hash: "abc".into()
            }
            .args(),
            ["branch", "fix", "abc"]
        );
        assert_eq!(
            Operation::BranchDelete { name: "old".into() }.args(),
            ["branch", "-d", "old"],
            "-d отказывается удалять неслитое — принудительное удаление не наше решение"
        );
        assert_eq!(
            Operation::BranchRename {
                from: "a".into(),
                to: "b".into()
            }
            .args(),
            ["branch", "-m", "a", "b"]
        );
        assert_eq!(
            Operation::TagAt {
                name: "v1".into(),
                hash: "abc".into()
            }
            .args(),
            ["tag", "v1", "abc"]
        );
    }

    #[test]
    fn amending_only_the_message_leaves_the_index_out_of_the_commit() {
        assert_eq!(
            Operation::AmendMessage {
                message: "better".into()
            }
            .args(),
            ["commit", "--amend", "--only", "-m", "better"],
            "без --only заготовленный индекс тихо въехал бы в чужой коммит"
        );
    }

    #[test]
    fn a_worktree_grows_at_the_chosen_path_from_the_chosen_ref() {
        assert_eq!(
            Operation::WorktreeAdd {
                path: "/tmp/wt".into(),
                at: "feature".into()
            }
            .args(),
            ["worktree", "add", "/tmp/wt", "feature"]
        );
    }

    #[test]
    fn dropping_a_commit_replays_its_children_onto_its_parent() {
        assert_eq!(
            Operation::Drop {
                hash: "abc123".into()
            }
            .args(),
            ["rebase", "--onto", "abc123^", "abc123"],
            "иначе выбросить середину истории без интерактивного ребейза нельзя"
        );
    }

    #[test]
    fn an_annotated_tag_carries_its_message_inline() {
        assert_eq!(
            Operation::AnnotatedTagAt {
                name: "v1".into(),
                message: "релиз".into(),
                hash: "abc".into()
            }
            .args(),
            ["tag", "-a", "v1", "-m", "релиз", "abc"]
        );
    }

    #[test]
    fn fetch_into_fast_forwards_a_branch_that_is_not_checked_out() {
        assert_eq!(
            Operation::FetchInto {
                remote: ".".into(),
                from: "branches".into(),
                into: "old".into()
            }
            .args(),
            ["fetch", ".", "branches:old"],
            "точка значит этот же репозиторий — локальный fast-forward без checkout"
        );
        assert_eq!(
            Operation::FetchInto {
                remote: "origin".into(),
                from: "dev".into(),
                into: "dev".into()
            }
            .args(),
            ["fetch", "origin", "dev:dev"]
        );
    }

    #[test]
    fn a_branch_is_pushed_or_deleted_on_its_remote_by_name() {
        assert_eq!(
            Operation::PushBranch {
                remote: "origin".into(),
                branch: "dev".into()
            }
            .args(),
            ["push", "--progress", "origin", "dev"]
        );
        assert_eq!(
            Operation::PushDelete {
                remote: "origin".into(),
                branch: "dev".into()
            }
            .args(),
            ["push", "origin", "--delete", "dev"]
        );
    }

    #[test]
    fn network_operations_know_they_reach_the_network() {
        assert!(Operation::PushBranch {
            remote: "o".into(),
            branch: "b".into()
        }
        .reaches_the_network());
        assert!(Operation::PushDelete {
            remote: "o".into(),
            branch: "b".into()
        }
        .reaches_the_network());
        assert!(Operation::FetchInto {
            remote: "origin".into(),
            from: "a".into(),
            into: "a".into()
        }
        .reaches_the_network());
        assert!(
            !Operation::FetchInto {
                remote: ".".into(),
                from: "a".into(),
                into: "b".into()
            }
            .reaches_the_network(),
            "локальный fast-forward в сеть не ходит и токена не требует"
        );
    }

    #[test]
    fn merge_and_rebase_do_not_wait_for_an_editor() {
        assert_eq!(
            Operation::Merge {
                branch: "feature".into()
            }
            .args(),
            ["merge", "--no-edit", "feature"]
        );
        assert_eq!(
            Operation::Rebase {
                onto: "main".into()
            }
            .args(),
            ["rebase", "main"]
        );
    }

    #[test]
    fn an_amend_rewrites_the_previous_commit_with_the_new_message() {
        assert_eq!(
            commit_args("better words", true),
            ["commit", "--amend", "-m", "better words"],
            "без --amend история получила бы второй коммит вместо исправленного"
        );
    }

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
    fn tracking_a_remote_branch_creates_the_local_one_and_follows_it() {
        let go = Operation::CheckoutTracking {
            upstream: "origin/dev/x".to_string(),
            local: "dev/x".to_string(),
        };
        assert_eq!(
            go.args(),
            ["checkout", "-b", "dev/x", "--track", "origin/dev/x"],
            "без --track ветка создалась бы без upstream, и стрелок у неё не было бы"
        );
    }

    #[test]
    fn an_existing_local_branch_is_switched_to_rather_than_recreated() {
        let locals = vec!["dev/x".to_string()];
        let remotes = vec!["origin".to_string()];
        assert_eq!(
            checkout_for("origin/dev/x", RefKindView::RemoteBranch, &locals, &remotes),
            Some(Operation::Checkout {
                branch: "dev/x".to_string()
            }),
            "checkout -b на существующей ветке падает"
        );
    }

    #[test]
    fn a_remote_prefix_is_stripped_by_the_remote_list_not_by_the_first_slash() {
        let remotes = vec!["origin".to_string()];
        assert_eq!(
            checkout_for(
                "origin/builds/facebook-fbsource",
                RefKindView::RemoteBranch,
                &[],
                &remotes
            ),
            Some(Operation::CheckoutTracking {
                upstream: "origin/builds/facebook-fbsource".to_string(),
                local: "builds/facebook-fbsource".to_string(),
            }),
            "резать до первого слэша значило бы потерять builds/"
        );
    }

    #[test]
    fn a_remote_whose_name_is_unknown_gives_no_command_rather_than_a_wrong_one() {
        let remotes = vec!["upstream".to_string()];
        assert_eq!(
            checkout_for("origin/main", RefKindView::RemoteBranch, &[], &remotes),
            None,
            "угадав remote, мы создали бы ветку с именем origin/main целиком"
        );
    }

    #[test]
    fn the_longest_matching_remote_wins_so_nested_names_survive() {
        let remotes = vec!["origin".to_string(), "origin/mirror".to_string()];
        assert_eq!(
            checkout_for(
                "origin/mirror/main",
                RefKindView::RemoteBranch,
                &[],
                &remotes
            ),
            Some(Operation::CheckoutTracking {
                upstream: "origin/mirror/main".to_string(),
                local: "main".to_string(),
            }),
            "иначе короткий remote съел бы имя длинного"
        );
    }

    #[test]
    fn a_local_branch_is_checked_out_by_its_own_name() {
        assert_eq!(
            checkout_for("main", RefKindView::LocalBranch, &[], &[]),
            Some(Operation::Checkout {
                branch: "main".to_string()
            })
        );
    }

    #[test]
    fn a_tag_and_a_stash_are_not_things_to_switch_to() {
        assert_eq!(checkout_for("v1.0", RefKindView::Tag, &[], &[]), None);
        assert_eq!(
            checkout_for("stash@{0}", RefKindView::Stash, &[], &[]),
            None
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
