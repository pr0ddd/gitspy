#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    Rejected,
    Conflict,
}

impl Refusal {
    pub fn code(&self) -> &'static str {
        match self {
            Refusal::Rejected => "exec.rejected",
            Refusal::Conflict => "exec.conflict",
        }
    }
}

pub fn of(stderr: &str) -> Option<Refusal> {
    if stderr.contains("[rejected]") && stderr.contains("non-fast-forward") {
        return Some(Refusal::Rejected);
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
    fn a_rejection_for_another_reason_is_not_called_non_fast_forward() {
        let stderr = " ! [rejected]        master -> master (fetch first)";
        assert_eq!(
            of(stderr),
            None,
            "иначе человеку советуют не то, что с ним случилось"
        );
    }

    #[test]
    fn an_unknown_failure_stays_unknown_instead_of_being_guessed() {
        assert_eq!(of("fatal: not a git repository"), None);
        assert_eq!(of(""), None);
    }
}
