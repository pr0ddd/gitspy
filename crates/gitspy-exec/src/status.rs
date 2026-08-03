#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Staged,
    Unstaged,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusEntry {
    pub side: Side,
    pub letter: char,
    pub path: String,
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InProgress {
    Merge,
    Rebase,
    CherryPick,
    Revert,
    Bisect,
}

impl InProgress {
    pub fn code(&self) -> &'static str {
        match self {
            InProgress::Merge => "merge",
            InProgress::Rebase => "rebase",
            InProgress::CherryPick => "cherryPick",
            InProgress::Revert => "revert",
            InProgress::Bisect => "bisect",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkingTree {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub head: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub entries: Vec<StatusEntry>,
    pub extra_parents: Vec<String>,
    pub in_progress: Option<InProgress>,
}

impl WorkingTree {
    pub fn staged(&self) -> usize {
        self.entries
            .iter()
            .filter(|e| e.side == Side::Staged)
            .count()
    }

    pub fn unstaged(&self) -> usize {
        self.entries
            .iter()
            .filter(|e| e.side == Side::Unstaged)
            .count()
    }

    pub fn conflicts(&self) -> usize {
        self.entries.iter().filter(|e| e.letter == 'U').count()
    }

    pub fn is_dirty(&self) -> bool {
        !self.entries.is_empty()
    }

    pub fn needs_a_row(&self) -> bool {
        self.is_dirty() || self.in_progress.is_some()
    }
}

const FIELDS_ORDINARY: usize = 8;
const FIELDS_RENAMED: usize = 9;
const FIELDS_UNMERGED: usize = 10;

fn fields_then_path(record: &str, fields: usize) -> (&str, String) {
    let mut parts = record.splitn(fields + 1, ' ');
    let mut head: Vec<&str> = Vec::with_capacity(fields);
    for _ in 0..fields {
        head.push(parts.next().unwrap_or_default());
    }
    let xy = head.get(1).copied().unwrap_or("..");
    (xy, parts.next().unwrap_or_default().to_string())
}

fn ahead_behind(value: &str) -> (u32, u32) {
    let mut ahead = 0;
    let mut behind = 0;
    for part in value.split_whitespace() {
        let (sign, digits) = part.split_at(1);
        let count = digits.parse::<u32>().unwrap_or(0);
        match sign {
            "+" => ahead = count,
            "-" => behind = count,
            _ => {}
        }
    }
    (ahead, behind)
}

pub fn parse(raw: &str) -> WorkingTree {
    let records: Vec<&str> = raw.split('\0').collect();
    let mut tree = WorkingTree::default();
    let mut i = 0;

    while i < records.len() {
        let record = records[i];
        i += 1;
        if record.is_empty() {
            continue;
        }

        let kind = record.split(' ').next().unwrap_or_default();
        match kind {
            "#" => {
                let mut parts = record.split(' ');
                parts.next();
                let key = parts.next().unwrap_or_default();
                let value = parts.collect::<Vec<_>>().join(" ");
                match key {
                    "branch.head" if value != "(detached)" => tree.branch = Some(value),
                    "branch.upstream" => tree.upstream = Some(value),
                    "branch.oid" if value != "(initial)" => tree.head = Some(value),
                    "branch.ab" => {
                        let (ahead, behind) = ahead_behind(&value);
                        tree.ahead = ahead;
                        tree.behind = behind;
                    }
                    _ => {}
                }
            }
            "1" => {
                let (xy, path) = fields_then_path(record, FIELDS_ORDINARY);
                push_pair(&mut tree, xy, path, None);
            }
            "2" => {
                let (xy, path) = fields_then_path(record, FIELDS_RENAMED);
                let old_path = records.get(i).map(|s| s.to_string());
                i += 1;
                push_pair(&mut tree, xy, path, old_path);
            }
            "u" => {
                let (_, path) = fields_then_path(record, FIELDS_UNMERGED);
                tree.entries.push(StatusEntry {
                    side: Side::Unstaged,
                    letter: 'U',
                    path,
                    old_path: None,
                });
            }
            "?" => {
                tree.entries.push(StatusEntry {
                    side: Side::Unstaged,
                    letter: '?',
                    path: record[2..].to_string(),
                    old_path: None,
                });
            }
            _ => {}
        }
    }

    tree
}

fn push_pair(tree: &mut WorkingTree, xy: &str, path: String, old_path: Option<String>) {
    let mut letters = xy.chars();
    let staged = letters.next().unwrap_or('.');
    let unstaged = letters.next().unwrap_or('.');

    if staged != '.' {
        tree.entries.push(StatusEntry {
            side: Side::Staged,
            letter: staged,
            path: path.clone(),
            old_path: old_path.clone(),
        });
    }
    if unstaged != '.' {
        tree.entries.push(StatusEntry {
            side: Side::Unstaged,
            letter: unstaged,
            path,
            old_path,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_clean_tree_has_nothing_in_it() {
        let tree = parse("# branch.oid abc\0# branch.head main\0");
        assert!(!tree.is_dirty());
        assert_eq!(tree.branch.as_deref(), Some("main"));
    }

    #[test]
    fn a_file_can_be_staged_and_changed_again_at_once() {
        let tree = parse("1 MM N... 100644 100644 100644 aaa bbb src/lib.rs\0");
        assert_eq!(tree.staged(), 1);
        assert_eq!(tree.unstaged(), 1);
        assert!(tree.entries.iter().all(|e| e.path == "src/lib.rs"));
    }

    #[test]
    fn a_staged_only_change_does_not_appear_as_unstaged() {
        let tree = parse("1 M. N... 100644 100644 100644 aaa bbb src/lib.rs\0");
        assert_eq!(tree.staged(), 1);
        assert_eq!(tree.unstaged(), 0);
    }

    #[test]
    fn an_untracked_file_is_unstaged() {
        let tree = parse("? новый файл.txt\0");
        assert_eq!(tree.unstaged(), 1);
        assert_eq!(tree.entries[0].letter, '?');
        assert_eq!(tree.entries[0].path, "новый файл.txt");
    }

    #[test]
    fn a_rename_carries_the_old_path_from_the_next_record() {
        let tree = parse("2 R. N... 100644 100644 100644 aaa bbb R100 new.rs\0old.rs\0");
        assert_eq!(tree.staged(), 1);
        assert_eq!(tree.entries[0].path, "new.rs");
        assert_eq!(tree.entries[0].old_path.as_deref(), Some("old.rs"));
    }

    #[test]
    fn a_record_after_a_rename_is_not_swallowed() {
        let tree =
            parse("2 R. N... 100644 100644 100644 aaa bbb R100 new.rs\0old.rs\0? next.txt\0");
        assert_eq!(tree.entries.len(), 2);
        assert_eq!(tree.entries[1].path, "next.txt");
    }

    #[test]
    fn a_tracked_path_with_spaces_is_not_cut_short() {
        let tree = parse("1 .M N... 100644 100644 100644 aaa bbb папка с пробелами/файл.txt\0");
        assert_eq!(
            tree.entries[0].path, "папка с пробелами/файл.txt",
            "путь идёт до конца записи, а не до первого пробела"
        );
    }

    #[test]
    fn a_conflict_is_reported_as_unmerged() {
        let tree = parse("u UU N... 100644 100644 100644 100644 aa bb cc both.rs\0");
        assert_eq!(tree.entries[0].letter, 'U');
        assert_eq!(tree.entries[0].path, "both.rs");
    }

    #[test]
    fn divergence_is_read_from_the_header() {
        let tree = parse("# branch.ab +12 -3\0");
        assert_eq!(tree.ahead, 12);
        assert_eq!(tree.behind, 3);
    }

    #[test]
    fn a_detached_head_has_no_branch() {
        let tree = parse("# branch.head (detached)\0");
        assert_eq!(tree.branch, None);
    }
}
