use crate::{blame, filehistory, Error, Git};
use std::path::Path;

impl Git {
    pub fn file_history(
        &self,
        repo: &Path,
        path: &str,
        start: Option<&str>,
    ) -> Result<Vec<filehistory::FileCommit>, Error> {
        let format = format!("--format={}", filehistory::FORMAT);
        let mut collected = Vec::new();
        let mut from = start.unwrap_or("HEAD").to_string();
        let mut at_path = path.to_string();

        loop {
            let raw = self.read_raw(
                repo,
                &[
                    "log",
                    &from,
                    "--full-history",
                    "-z",
                    "--name-status",
                    &format,
                    "--",
                    &at_path,
                ],
            )?;
            let mut batch = filehistory::parse(&raw, &at_path);
            let renamed = batch.last().and_then(|born| {
                (born.status == 'A')
                    .then(|| self.rename_source(repo, &born.hash, &at_path))
                    .flatten()
                    .map(|older| (born.hash.clone(), older))
            });
            if let (Some(born), Some((_, older))) = (batch.last_mut(), &renamed) {
                born.status = 'R';
                born.old_path = Some(older.clone());
            }
            collected.extend(batch);

            match renamed {
                Some((hash, older)) if older != at_path => {
                    from = format!("{hash}^");
                    at_path = older;
                }
                _ => return Ok(collected),
            }
        }
    }

    pub(crate) fn rename_source(&self, repo: &Path, hash: &str, path: &str) -> Option<String> {
        let raw = self
            .read_raw(
                repo,
                &[
                    "diff-tree",
                    "-M",
                    "-r",
                    "-z",
                    "--name-status",
                    "--no-commit-id",
                    &format!("{hash}^"),
                    hash,
                ],
            )
            .ok()?;
        let mut tokens = raw.split('\0');
        while let Some(status) = tokens.next() {
            let status = status.trim_start_matches('\n');
            if status.is_empty() {
                continue;
            }
            if status.starts_with('R') || status.starts_with('C') {
                let older = tokens.next()?;
                let newer = tokens.next()?;
                if newer == path {
                    return Some(older.to_string());
                }
            } else {
                tokens.next()?;
            }
        }
        None
    }

    pub fn blame_file(
        &self,
        repo: &Path,
        path: &str,
        at: Option<&str>,
    ) -> Result<Vec<blame::BlameSpan>, Error> {
        let mut args = vec!["blame", "--line-porcelain"];
        if let Some(hash) = at {
            args.push(hash);
        }
        args.extend(["--", path]);
        self.read_raw(repo, &args).map(|raw| blame::parse(&raw))
    }
}
