pub const FORMAT: &str = "%(HEAD)%09%(refname)%09%(objecttype)%09%(objectname)%09%(*objecttype)%09%(*objectname)%09%(upstream:short)%09%(upstream:track,nobracket)";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefKind {
    LocalBranch,
    RemoteBranch,
    Tag,
    Stash,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefLine {
    pub name: String,
    pub full_name: String,
    pub kind: RefKind,
    pub oid: String,
    pub is_head: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub gone: bool,
}

pub fn parse_track(raw: &str) -> (u32, u32, bool) {
    let text = raw.trim();
    if text == "gone" {
        return (0, 0, true);
    }

    let mut ahead = 0;
    let mut behind = 0;
    for part in text.split(',') {
        let mut words = part.split_whitespace();
        match (words.next(), words.next().and_then(|n| n.parse().ok())) {
            (Some("ahead"), Some(count)) => ahead = count,
            (Some("behind"), Some(count)) => behind = count,
            _ => {}
        }
    }
    (ahead, behind, false)
}

fn classify(full_name: &str) -> Option<(String, RefKind)> {
    if let Some(rest) = full_name.strip_prefix("refs/heads/") {
        return Some((rest.to_string(), RefKind::LocalBranch));
    }
    if let Some(rest) = full_name.strip_prefix("refs/remotes/") {
        if rest == "HEAD" || rest.ends_with("/HEAD") {
            return None;
        }
        return Some((rest.to_string(), RefKind::RemoteBranch));
    }
    full_name
        .strip_prefix("refs/tags/")
        .map(|rest| (rest.to_string(), RefKind::Tag))
}

fn effective<'a>(direct: &'a str, peeled: &'a str) -> &'a str {
    if peeled.is_empty() {
        direct
    } else {
        peeled
    }
}

pub fn mentions_stash(raw: &str) -> bool {
    raw.lines()
        .filter_map(|line| line.split('\t').nth(1))
        .any(|name| name == "refs/stash")
}

pub fn parse_for_each_ref(raw: &str) -> Vec<RefLine> {
    raw.lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split('\t').collect();
            if fields.len() < 8 {
                return None;
            }

            let full_name = fields[1];
            let (name, kind) = classify(full_name)?;
            if effective(fields[2], fields[4]) != "commit" {
                return None;
            }

            let upstream = fields[6];
            let (ahead, behind, gone) = parse_track(fields[7]);

            Some(RefLine {
                name,
                full_name: full_name.to_string(),
                kind,
                oid: effective(fields[3], fields[5]).to_string(),
                is_head: fields[0].trim() == "*",
                upstream: (!upstream.is_empty()).then(|| upstream.to_string()),
                ahead,
                behind,
                gone,
            })
        })
        .collect()
}

pub fn parse_stash_list(raw: &str) -> Vec<RefLine> {
    raw.lines()
        .filter_map(|line| {
            let mut fields = line.split('\t');
            let oid = fields.next()?;
            let name = fields.next()?;
            if oid.is_empty() || name.is_empty() {
                return None;
            }

            Some(RefLine {
                name: name.to_string(),
                full_name: "refs/stash".to_string(),
                kind: RefKind::Stash,
                oid: oid.to_string(),
                is_head: false,
                upstream: None,
                ahead: 0,
                behind: 0,
                gone: false,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(fields: &[&str]) -> String {
        fields.join("\t")
    }

    #[test]
    fn a_plain_branch_gives_its_short_name_and_commit() {
        let raw = line(&[
            "*",
            "refs/heads/main",
            "commit",
            "aaa",
            "",
            "",
            "origin/main",
            "",
        ]);
        let parsed = parse_for_each_ref(&raw);
        assert_eq!(parsed.len(), 1);
        assert_eq!(
            parsed[0].name, "main",
            "the name is shown in its short form"
        );
        assert_eq!(parsed[0].full_name, "refs/heads/main");
        assert_eq!(parsed[0].kind, RefKind::LocalBranch);
        assert_eq!(parsed[0].oid, "aaa");
        assert!(
            parsed[0].is_head,
            "an asterisk in %(HEAD) means this is the current branch"
        );
        assert_eq!(parsed[0].upstream.as_deref(), Some("origin/main"));
    }

    #[test]
    fn an_annotated_tag_resolves_to_the_commit_it_peels_to() {
        let raw = line(&[
            "",
            "refs/tags/heavy",
            "tag",
            "tagoid",
            "commit",
            "commitoid",
            "",
            "",
        ]);
        let parsed = parse_for_each_ref(&raw);
        assert_eq!(
            parsed[0].oid, "commitoid",
            "otherwise the tag would point at the tag object instead of the commit"
        );
        assert_eq!(parsed[0].kind, RefKind::Tag);
    }

    #[test]
    fn a_tag_pointing_at_a_blob_is_dropped_rather_than_breaking_the_walk() {
        let raw = line(&[
            "",
            "refs/tags/onblob",
            "tag",
            "tagoid",
            "blob",
            "bloboid",
            "",
            "",
        ]);
        assert!(
            parse_for_each_ref(&raw).is_empty(),
            "such an oid among the walk tips breaks reading the whole repository"
        );
    }

    #[test]
    fn a_tag_pointing_at_a_tree_is_dropped_too() {
        let raw = line(&[
            "",
            "refs/tags/ontree",
            "tag",
            "tagoid",
            "tree",
            "treeoid",
            "",
            "",
        ]);
        assert!(parse_for_each_ref(&raw).is_empty());
    }

    #[test]
    fn the_remote_head_pointer_is_not_a_branch() {
        let raw = line(&[
            "",
            "refs/remotes/origin/HEAD",
            "commit",
            "aaa",
            "",
            "",
            "",
            "",
        ]);
        assert!(
            parse_for_each_ref(&raw).is_empty(),
            "origin/HEAD is a pointer to the default branch, not a branch of its own"
        );
    }

    #[test]
    fn a_remote_branch_keeps_the_remote_in_its_short_name() {
        let raw = line(&[
            "",
            "refs/remotes/origin/dev/x",
            "commit",
            "aaa",
            "",
            "",
            "",
            "",
        ]);
        let parsed = parse_for_each_ref(&raw);
        assert_eq!(parsed[0].name, "origin/dev/x");
        assert_eq!(parsed[0].kind, RefKind::RemoteBranch);
    }

    #[test]
    fn refs_outside_the_four_kinds_are_ignored() {
        let raw = line(&["", "refs/notes/commits", "commit", "aaa", "", "", "", ""]);
        assert!(
            parse_for_each_ref(&raw).is_empty(),
            "notes are kept out of the graph, the decision is recorded in the phase plan"
        );
    }

    #[test]
    fn tracking_is_read_in_all_four_shapes() {
        assert_eq!(
            parse_track(""),
            (0, 0, false),
            "empty means the branch was compared with its upstream and is in sync"
        );
        assert_eq!(parse_track("ahead 2"), (2, 0, false));
        assert_eq!(parse_track("behind 3"), (0, 3, false));
        assert_eq!(parse_track("ahead 2, behind 1"), (2, 1, false));
        assert_eq!(
            parse_track("gone"),
            (0, 0, true),
            "the upstream is configured but no longer exists"
        );
    }

    #[test]
    fn a_branch_without_an_upstream_has_no_numbers_at_all() {
        let raw = line(&["", "refs/heads/solo", "commit", "aaa", "", "", "", ""]);
        let parsed = parse_for_each_ref(&raw);
        assert_eq!(parsed[0].upstream, None);
        assert_eq!(
            (parsed[0].ahead, parsed[0].behind, parsed[0].gone),
            (0, 0, false)
        );
    }

    #[test]
    fn the_stash_ref_is_left_to_the_stash_list_because_it_names_only_the_top() {
        let raw = line(&["", "refs/stash", "commit", "aaa", "", "", "", ""]);
        assert!(
            parse_for_each_ref(&raw).is_empty(),
            "the remaining entries are reachable only through the reflog"
        );
        assert!(
            mentions_stash(&raw),
            "but its presence still has to be known, so git is not called for nothing"
        );
    }

    #[test]
    fn every_stash_entry_becomes_a_ref_of_its_own() {
        let raw = "aaa\tstash@{0}\tWIP on main: 1234567 subject\nbbb\tstash@{1}\tWIP on main: 1234567 subject";
        let parsed = parse_stash_list(raw);
        assert_eq!(parsed.len(), 2, "seeing only stash@{{0}} is the old defect");
        assert_eq!(parsed[0].name, "stash@{0}");
        assert_eq!(parsed[0].oid, "aaa");
        assert_eq!(parsed[1].kind, RefKind::Stash);
    }

    #[test]
    fn empty_output_gives_no_refs_rather_than_one_empty_ref() {
        assert!(parse_for_each_ref("").is_empty());
        assert!(parse_for_each_ref("\n").is_empty());
        assert!(parse_stash_list("").is_empty());
    }
}
