#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileCommit {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub subject: String,
    pub status: char,
    pub path: String,
    pub old_path: Option<String>,
}

pub const FORMAT: &str = "%H%x09%an%x09%ae%x09%at%x09%s";

fn header_of(token: &str) -> Option<FileCommit> {
    let mut parts = token.splitn(5, '\t');
    let hash = parts.next()?;
    if hash.len() != 40 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    Some(FileCommit {
        hash: hash.to_string(),
        author: parts.next()?.to_string(),
        email: parts.next()?.to_string(),
        time: parts.next()?.parse().ok()?,
        subject: parts.next().unwrap_or_default().to_string(),
        status: ' ',
        path: String::new(),
        old_path: None,
    })
}

pub fn parse(raw: &str, requested_path: &str) -> Vec<FileCommit> {
    let mut commits: Vec<FileCommit> = Vec::new();
    let mut tokens = raw.split('\0').peekable();

    while let Some(token) = tokens.next() {
        let token = token.trim_start_matches('\n');
        let Some(mut commit) = header_of(token) else {
            continue;
        };
        if let Some(status_token) = tokens.peek() {
            if header_of(status_token).is_none() && !status_token.is_empty() {
                let status_token = tokens.next().expect("peek saw this token");
                commit.status = status_token
                    .trim_start_matches('\n')
                    .chars()
                    .next()
                    .unwrap_or(' ');
                let first_path = tokens.next().map(str::to_string).unwrap_or_default();
                if matches!(commit.status, 'R' | 'C') {
                    commit.old_path = Some(first_path);
                    commit.path = tokens.next().map(str::to_string).unwrap_or_default();
                } else {
                    commit.path = first_path;
                }
            }
        }
        commits.push(commit);
    }

    let mut inherited = requested_path.to_string();
    for commit in &mut commits {
        if commit.path.is_empty() {
            commit.path.clone_from(&inherited);
        } else {
            inherited.clone_from(&commit.path);
        }
    }
    commits
}
