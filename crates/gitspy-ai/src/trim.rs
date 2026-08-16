pub const FILE_LIMIT: usize = 2048;
pub const TOTAL_LIMIT: usize = 10240;

const LOCK_FILES: &[&str] = &[
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "composer.lock",
    "Gemfile.lock",
    "go.sum",
    "poetry.lock",
];

pub fn trim_diff(diff: &str) -> String {
    let mut out = String::new();
    let mut unlisted = 0usize;
    for chunk in split_files(diff) {
        let shaped = shape_file(chunk);
        if out.len() + shaped.len() <= TOTAL_LIMIT {
            out.push_str(&shaped);
        } else if out.len() < TOTAL_LIMIT {
            out.push_str(&counted_header(chunk));
        } else {
            unlisted += 1;
        }
    }
    if unlisted > 0 {
        out.push_str(&format!("[{unlisted} more changed files]\n"));
    }
    out
}

fn split_files(diff: &str) -> Vec<&str> {
    let mut starts: Vec<usize> = diff
        .lines()
        .scan(0usize, |offset, line| {
            let here = *offset;
            *offset += line.len() + 1;
            Some((here, line))
        })
        .filter(|(_, line)| line.starts_with("diff --git "))
        .map(|(offset, _)| offset)
        .collect();
    starts.push(diff.len());
    starts
        .windows(2)
        .map(|pair| &diff[pair[0]..pair[1]])
        .collect()
}

fn file_path(chunk: &str) -> &str {
    chunk
        .lines()
        .next()
        .and_then(|header| header.split(" b/").nth(1))
        .unwrap_or("")
}

fn header_of(chunk: &str) -> &str {
    chunk.lines().next().unwrap_or("")
}

fn is_binary(chunk: &str) -> bool {
    chunk.contains("\nBinary files ") || chunk.contains("\nGIT binary patch")
}

fn is_lock_file(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    LOCK_FILES.contains(&name)
}

fn added_removed(chunk: &str) -> (usize, usize) {
    let added = chunk
        .lines()
        .filter(|line| line.starts_with('+') && !line.starts_with("+++"))
        .count();
    let removed = chunk
        .lines()
        .filter(|line| line.starts_with('-') && !line.starts_with("---"))
        .count();
    (added, removed)
}

fn counted_header(chunk: &str) -> String {
    let (added, removed) = added_removed(chunk);
    format!("{} (+{added} -{removed})\n", header_of(chunk))
}

fn cut_at_line_boundary(chunk: &str, limit: usize) -> &str {
    if chunk.len() <= limit {
        return chunk;
    }
    let mut boundary = limit;
    while !chunk.is_char_boundary(boundary) {
        boundary -= 1;
    }
    let cut = chunk[..boundary]
        .rfind('\n')
        .map(|at| at + 1)
        .unwrap_or(boundary);
    &chunk[..cut]
}

fn shape_file(chunk: &str) -> String {
    if is_lock_file(file_path(chunk)) {
        return format!("{}\n[lock file]\n", header_of(chunk));
    }
    if is_binary(chunk) {
        return format!("{}\n[binary file]\n", header_of(chunk));
    }
    if chunk.len() > FILE_LIMIT {
        return format!("{}[truncated]\n", cut_at_line_boundary(chunk, FILE_LIMIT));
    }
    chunk.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file_chunk(path: &str, body_lines: usize) -> String {
        let mut chunk = format!(
            "diff --git a/{path} b/{path}\nindex 0000000..1111111 100644\n--- a/{path}\n+++ b/{path}\n@@ -1,1 +1,{body_lines} @@\n"
        );
        for n in 0..body_lines {
            chunk.push_str(&format!("+added line {n}\n"));
        }
        chunk
    }

    #[test]
    fn small_diff_passes_unchanged() {
        let diff = file_chunk("src/a.rs", 3);
        assert_eq!(
            trim_diff(&diff),
            diff,
            "a diff under the limits is left untouched"
        );
    }

    #[test]
    fn oversized_file_is_cut_at_file_limit() {
        let diff = file_chunk("src/big.rs", 400);
        let trimmed = trim_diff(&diff);
        assert!(
            trimmed.len() < diff.len(),
            "a file over the per-file limit has to shrink"
        );
        assert!(
            trimmed.contains("diff --git a/src/big.rs"),
            "the file header stays"
        );
        assert!(
            trimmed.contains("[truncated]"),
            "the truncation is stated explicitly"
        );
        assert!(
            trimmed.len() <= FILE_LIMIT + 200,
            "the tail past the limit does not leak through"
        );
    }

    #[test]
    fn cyrillic_body_is_cut_at_a_char_boundary_not_at_a_byte() {
        for pad in 0..4 {
            let mut chunk = format!("diff --git a/d.md b/d.md\n{}\n", "x".repeat(pad));
            let line = format!("+{}\n", "é".repeat(400));
            while chunk.len() <= FILE_LIMIT {
                chunk.push_str(&line);
            }
            let trimmed = trim_diff(&chunk);
            assert!(
                trimmed.contains("[truncated]"),
                "a multi-byte non-ASCII diff is trimmed without a panic at offset {pad}"
            );
        }
    }

    #[test]
    fn binary_file_becomes_a_stub() {
        let diff = "diff --git a/logo.png b/logo.png\nindex 0000000..1111111 100644\nBinary files a/logo.png and b/logo.png differ\n";
        let trimmed = trim_diff(diff);
        assert!(
            trimmed.contains("diff --git a/logo.png"),
            "the file header stays"
        );
        assert!(
            trimmed.contains("[binary file]"),
            "a stub stands in for the binary body"
        );
        assert!(
            !trimmed.contains("Binary files"),
            "the raw git marker does not reach the model"
        );
    }

    #[test]
    fn lock_file_becomes_a_stub() {
        let diff = file_chunk("package-lock.json", 50);
        let trimmed = trim_diff(&diff);
        assert!(
            trimmed.contains("diff --git a/package-lock.json"),
            "the file header stays"
        );
        assert!(
            trimmed.contains("[lock file]"),
            "the model has no use for the body of a lock file"
        );
        assert!(
            !trimmed.contains("added line"),
            "the lines of the lock file are dropped"
        );
    }

    #[test]
    fn total_limit_collapses_tail_files_to_counted_headers() {
        let mut diff = String::new();
        for n in 0..40 {
            diff.push_str(&file_chunk(&format!("src/file{n}.rs"), 100));
        }
        let trimmed = trim_diff(&diff);
        assert!(
            trimmed.len() <= TOTAL_LIMIT + FILE_LIMIT,
            "the total limit holds"
        );
        assert!(
            trimmed.contains("(+100 -0)"),
            "a collapsed file keeps its line counts"
        );
    }

    #[test]
    fn hundreds_of_files_stay_bounded_by_a_tail_counter() {
        let mut diff = String::new();
        for n in 0..500 {
            diff.push_str(&file_chunk(&format!("src/file{n}.rs"), 100));
        }
        let trimmed = trim_diff(&diff);
        assert!(
            trimmed.len() <= TOTAL_LIMIT + FILE_LIMIT,
            "the output does not grow across hundreds of files either: tail headers are not free"
        );
        assert!(
            trimmed.contains("more changed files]"),
            "the tail that did not fit is counted in a single line instead of being enumerated"
        );
    }
}
