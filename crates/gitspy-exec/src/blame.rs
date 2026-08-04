use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlameSpan {
    pub hash: String,
    pub author: String,
    pub time: i64,
    pub summary: String,
    pub start_line: u32,
    pub lines: u32,
}

#[derive(Debug, Clone, Default)]
struct Meta {
    author: String,
    time: i64,
    summary: String,
}

pub fn parse(raw: &str) -> Vec<BlameSpan> {
    let mut metas: HashMap<String, Meta> = HashMap::new();
    let mut spans: Vec<BlameSpan> = Vec::new();
    let mut current: Option<(String, u32)> = None;

    for line in raw.lines() {
        if line.starts_with('\t') {
            continue;
        }
        if let Some((hash, line_no)) = header_of(line) {
            match spans.last_mut() {
                Some(last) if last.hash == hash && last.start_line + last.lines == line_no => {
                    last.lines += 1;
                }
                _ => {
                    let meta = metas.entry(hash.clone()).or_default().clone();
                    spans.push(BlameSpan {
                        hash: hash.clone(),
                        author: meta.author,
                        time: meta.time,
                        summary: meta.summary,
                        start_line: line_no,
                        lines: 1,
                    });
                }
            }
            current = Some((hash, line_no));
            continue;
        }

        let Some((hash, _)) = &current else { continue };
        let meta = metas.entry(hash.clone()).or_default();
        if let Some(author) = line.strip_prefix("author ") {
            author.clone_into(&mut meta.author);
        } else if let Some(time) = line.strip_prefix("author-time ") {
            meta.time = time.parse().unwrap_or_default();
        } else if let Some(summary) = line.strip_prefix("summary ") {
            summary.clone_into(&mut meta.summary);
        } else {
            continue;
        }
        if let Some(span) = spans.last_mut() {
            if span.hash == *hash {
                span.author.clone_from(&meta.author);
                span.time = meta.time;
                span.summary.clone_from(&meta.summary);
            }
        }
    }
    spans
}

fn header_of(line: &str) -> Option<(String, u32)> {
    let mut parts = line.split(' ');
    let hash = parts.next()?;
    if hash.len() != 40 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    parts.next()?;
    let final_line: u32 = parts.next()?.parse().ok()?;
    Some((hash.to_string(), final_line))
}
