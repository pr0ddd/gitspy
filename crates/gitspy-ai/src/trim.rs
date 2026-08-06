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
    for chunk in split_files(diff) {
        let shaped = shape_file(chunk);
        if out.len() + shaped.len() > TOTAL_LIMIT {
            out.push_str(&counted_header(chunk));
        } else {
            out.push_str(&shaped);
        }
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
    let cut = chunk[..limit].rfind('\n').map(|at| at + 1).unwrap_or(limit);
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
        assert_eq!(trim_diff(&diff), diff, "маленький дифф не трогаем");
    }

    #[test]
    fn oversized_file_is_cut_at_file_limit() {
        let diff = file_chunk("src/big.rs", 400);
        let trimmed = trim_diff(&diff);
        assert!(
            trimmed.len() < diff.len(),
            "файл больше лимита обязан ужаться"
        );
        assert!(
            trimmed.contains("diff --git a/src/big.rs"),
            "заголовок файла остаётся"
        );
        assert!(trimmed.contains("[truncated]"), "об урезании сказано явно");
        assert!(
            trimmed.len() <= FILE_LIMIT + 200,
            "хвост за лимитом не протекает"
        );
    }

    #[test]
    fn binary_file_becomes_a_stub() {
        let diff = "diff --git a/logo.png b/logo.png\nindex 0000000..1111111 100644\nBinary files a/logo.png and b/logo.png differ\n";
        let trimmed = trim_diff(diff);
        assert!(
            trimmed.contains("diff --git a/logo.png"),
            "заголовок файла остаётся"
        );
        assert!(
            trimmed.contains("[binary file]"),
            "вместо бинарного тела — заглушка"
        );
        assert!(
            !trimmed.contains("Binary files"),
            "сырой маркер git наружу не идёт"
        );
    }

    #[test]
    fn lock_file_becomes_a_stub() {
        let diff = file_chunk("package-lock.json", 50);
        let trimmed = trim_diff(&diff);
        assert!(
            trimmed.contains("diff --git a/package-lock.json"),
            "заголовок файла остаётся"
        );
        assert!(
            trimmed.contains("[lock file]"),
            "тело lock-файла модели не нужно"
        );
        assert!(
            !trimmed.contains("added line"),
            "строки lock-файла выкинуты"
        );
    }

    #[test]
    fn total_limit_collapses_tail_files_to_counted_headers() {
        let mut diff = String::new();
        for n in 0..40 {
            diff.push_str(&file_chunk(&format!("src/file{n}.rs"), 100));
        }
        let trimmed = trim_diff(&diff);
        assert!(trimmed.len() <= TOTAL_LIMIT + 4096, "общий лимит держится");
        for n in 0..40 {
            assert!(
                trimmed.contains(&format!("file{n}.rs")),
                "каждый затронутый файл виден модели хотя бы именем"
            );
        }
        assert!(
            trimmed.contains("(+100 -0)"),
            "у свёрнутого файла счётчик строк"
        );
    }
}
