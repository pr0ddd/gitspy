#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Status {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Unmerged,
    Unknown(char),
}

impl Status {
    pub fn from_letter(letter: char) -> Self {
        match letter {
            'A' => Status::Added,
            'M' => Status::Modified,
            'D' => Status::Deleted,
            'R' => Status::Renamed,
            'C' => Status::Copied,
            'T' => Status::TypeChanged,
            'U' => Status::Unmerged,
            other => Status::Unknown(other),
        }
    }

    pub fn letter(&self) -> char {
        match self {
            Status::Added => 'A',
            Status::Modified => 'M',
            Status::Deleted => 'D',
            Status::Renamed => 'R',
            Status::Copied => 'C',
            Status::TypeChanged => 'T',
            Status::Unmerged => 'U',
            Status::Unknown(other) => *other,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangedFile {
    pub status: Status,
    pub path: String,
    pub old_path: Option<String>,
    pub similarity: Option<u8>,
    pub added: Option<u32>,
    pub deleted: Option<u32>,
}

impl ChangedFile {
    pub fn is_binary(&self) -> bool {
        self.added.is_none() && self.deleted.is_none()
    }
}

fn fields(raw: &str) -> Vec<&str> {
    raw.split('\0').filter(|part| !part.is_empty()).collect()
}

pub fn parse_name_status(raw: &str) -> Vec<ChangedFile> {
    let parts = fields(raw);
    let mut files = Vec::new();
    let mut i = 0;

    while i < parts.len() {
        let marker = parts[i];
        let letter = marker.chars().next().unwrap_or('?');
        let status = Status::from_letter(letter);
        let similarity = marker[1..].parse::<u8>().ok();

        let takes_two = matches!(status, Status::Renamed | Status::Copied);
        if takes_two {
            if i + 2 >= parts.len() {
                break;
            }
            files.push(ChangedFile {
                status,
                path: parts[i + 2].to_string(),
                old_path: Some(parts[i + 1].to_string()),
                similarity,
                added: None,
                deleted: None,
            });
            i += 3;
        } else {
            if i + 1 >= parts.len() {
                break;
            }
            files.push(ChangedFile {
                status,
                path: parts[i + 1].to_string(),
                old_path: None,
                similarity,
                added: None,
                deleted: None,
            });
            i += 2;
        }
    }
    files
}

pub fn parse_numstat(raw: &str) -> Vec<(String, Option<u32>, Option<u32>)> {
    let parts = fields(raw);
    let mut counts = Vec::new();
    let mut i = 0;

    while i < parts.len() {
        let head = parts[i];
        let mut columns = head.split('\t');
        let added = columns.next().unwrap_or("-");
        let deleted = columns.next().unwrap_or("-");
        let inline_path = columns.next().unwrap_or("");

        let added = added.parse::<u32>().ok();
        let deleted = deleted.parse::<u32>().ok();

        if inline_path.is_empty() {
            if i + 2 >= parts.len() {
                break;
            }
            counts.push((parts[i + 2].to_string(), added, deleted));
            i += 3;
        } else {
            counts.push((inline_path.to_string(), added, deleted));
            i += 1;
        }
    }
    counts
}

pub fn merge(
    mut files: Vec<ChangedFile>,
    counts: Vec<(String, Option<u32>, Option<u32>)>,
) -> Vec<ChangedFile> {
    for (path, added, deleted) in counts {
        if let Some(file) = files.iter_mut().find(|f| f.path == path) {
            file.added = added;
            file.deleted = deleted;
        }
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_change_is_one_marker_and_one_path() {
        let files = parse_name_status("M\0src/lib.rs\0");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, Status::Modified);
        assert_eq!(files[0].path, "src/lib.rs");
        assert_eq!(files[0].old_path, None);
    }

    #[test]
    fn a_rename_carries_both_paths_and_the_similarity() {
        let files = parse_name_status("R096\0old/name.rs\0new/name.rs\0");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, Status::Renamed);
        assert_eq!(files[0].old_path.as_deref(), Some("old/name.rs"));
        assert_eq!(files[0].path, "new/name.rs");
        assert_eq!(files[0].similarity, Some(96));
    }

    #[test]
    fn paths_with_spaces_survive_because_the_separator_is_nul() {
        let files = parse_name_status("A\0папка с пробелами/файл.txt\0");
        assert_eq!(files[0].path, "папка с пробелами/файл.txt");
    }

    #[test]
    fn a_binary_file_has_no_counts() {
        let counts = parse_numstat("-\t-\tlogo.png\0");
        assert_eq!(counts, vec![("logo.png".to_string(), None, None)]);
    }

    #[test]
    fn a_renamed_file_puts_its_paths_after_the_counts() {
        let counts = parse_numstat("3\t1\t\0old.rs\0new.rs\0");
        assert_eq!(counts, vec![("new.rs".to_string(), Some(3), Some(1))]);
    }

    #[test]
    fn counts_land_on_the_file_they_belong_to() {
        let files = parse_name_status("M\0a.rs\0A\0b.rs\0");
        let counts = parse_numstat("5\t2\ta.rs\u{0}9\t0\tb.rs\u{0}");
        let merged = merge(files, counts);
        assert_eq!(merged[0].added, Some(5));
        assert_eq!(merged[0].deleted, Some(2));
        assert_eq!(merged[1].added, Some(9));
    }

    #[test]
    fn an_empty_diff_yields_nothing() {
        assert!(parse_name_status("").is_empty());
        assert!(parse_numstat("").is_empty());
    }
}
