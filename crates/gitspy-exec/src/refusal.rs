#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    Rejected,
    Conflict,
    CheckoutBlocked,
    PullDiverged,
}

impl Refusal {
    pub fn code(&self) -> &'static str {
        match self {
            Refusal::Rejected => "exec.rejected",
            Refusal::Conflict => "exec.conflict",
            Refusal::CheckoutBlocked => "exec.checkoutBlocked",
            Refusal::PullDiverged => "exec.pullDiverged",
        }
    }
}

pub fn of(stderr: &str) -> Option<Refusal> {
    if stderr.contains("[rejected]") && stderr.contains("non-fast-forward") {
        return Some(Refusal::Rejected);
    }
    if stderr.contains("Need to specify how to reconcile divergent branches") {
        return Some(Refusal::PullDiverged);
    }
    if stderr.contains("would be overwritten by checkout")
        || stderr.contains("before you switch branches")
    {
        return Some(Refusal::CheckoutBlocked);
    }
    if stderr.contains("CONFLICT (") || stderr.contains("Automatic merge failed") {
        return Some(Refusal::Conflict);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rejected_push_is_named_rather_than_called_a_failure() {
        let stderr = " ! [rejected]        master -> master (non-fast-forward)\n\
                       error: failed to push some refs to 'github.com:pr0ddd/gitspy.git'";
        assert_eq!(of(stderr), Some(Refusal::Rejected));
    }

    #[test]
    fn a_merge_conflict_is_a_state_of_the_repository_not_a_broken_command() {
        let stderr = "CONFLICT (content): Merge conflict in src/App.tsx\n\
                      Automatic merge failed; fix conflicts and then commit the result.";
        assert_eq!(of(stderr), Some(Refusal::Conflict));
    }

    #[test]
    fn a_checkout_blocked_by_local_changes_is_not_called_a_merge_conflict() {
        let stderr =
            "error: Your local changes to the following files would be overwritten by checkout:\n\
                      \tsrc/App.tsx\n\
                      Please commit your changes or stash them before you switch branches.\n\
                      Aborting";
        assert_eq!(
            of(stderr),
            Some(Refusal::CheckoutBlocked),
            "the user has to be offered a stash, not conflict resolution"
        );
    }

    #[test]
    fn an_untracked_file_in_the_way_blocks_checkout_the_same_way() {
        let stderr =
            "error: The following untracked working tree files would be overwritten by checkout:\n\
                      \tnotes.md\n\
                      Please move or remove them before you switch branches.\n\
                      Aborting";
        assert_eq!(of(stderr), Some(Refusal::CheckoutBlocked));
    }

    #[test]
    fn a_rejection_for_another_reason_is_not_called_non_fast_forward() {
        let stderr = " ! [rejected]        master -> master (fetch first)";
        assert_eq!(
            of(stderr),
            None,
            "otherwise the user is advised about something other than what happened"
        );
    }

    #[test]
    fn an_unknown_failure_stays_unknown_instead_of_being_guessed() {
        assert_eq!(of("fatal: not a git repository"), None);
        assert_eq!(of(""), None);
    }

    #[test]
    fn a_pull_into_diverged_branches_asks_for_a_strategy_instead_of_dumping_hints() {
        let stderr =
            "hint: You have divergent branches and need to specify how to reconcile them.\n\
                      hint: git config pull.rebase false  # merge\n\
                      fatal: Need to specify how to reconcile divergent branches.";
        assert_eq!(
            of(stderr),
            Some(Refusal::PullDiverged),
            "the wall of git hints is unreadable, the user needs a choice between merge and rebase"
        );
    }
}
