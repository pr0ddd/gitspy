use crate::{refs, Error, Git};
use std::path::{Path, PathBuf};

impl Git {
    pub fn head_branch(&self, repo: &Path) -> Result<Option<String>, Error> {
        match self.read(repo, &["symbolic-ref", "--short", "-q", "HEAD"]) {
            Ok(raw) => Ok(Some(raw.trim().to_string()).filter(|s| !s.is_empty())),
            Err(Error::Failed { .. }) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn origin_url(&self, repo: &Path) -> Result<Option<String>, Error> {
        match self.read(repo, &["config", "--get", "remote.origin.url"]) {
            Ok(raw) => Ok(Some(raw.trim().to_string()).filter(|s| !s.is_empty())),
            Err(Error::Failed { .. }) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub(crate) fn has_parent(&self, repo: &Path, commit: &str) -> bool {
        self.read(
            repo,
            &["rev-parse", "-q", "--verify", &format!("{commit}^1")],
        )
        .is_ok()
    }

    pub fn refs(&self, repo: &Path) -> Result<Vec<refs::RefLine>, Error> {
        let format = format!("--format={}", refs::FORMAT);
        let raw = self.read(repo, &["for-each-ref", &format])?;
        let mut found = refs::parse_for_each_ref(&raw);

        if refs::mentions_stash(&raw) {
            let listed = self.read(repo, &["stash", "list", "--format=%H%x09%gd%x09%gs"])?;
            found.extend(refs::parse_stash_list(&listed));
        }

        Ok(found)
    }

    pub fn head_oid(&self, repo: &Path) -> Option<String> {
        let raw = self
            .read(repo, &["rev-parse", "-q", "--verify", "HEAD"])
            .ok()?;
        let trimmed = raw.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    }

    pub(crate) fn git_dir(&self, repo: &Path) -> PathBuf {
        let dot = repo.join(".git");
        if dot.is_dir() {
            dot
        } else {
            repo.to_path_buf()
        }
    }

    pub fn toplevel(&self, dropped: &Path) -> Result<Option<PathBuf>, Error> {
        let start = if dropped.is_dir() {
            dropped
        } else {
            dropped.parent().unwrap_or(dropped)
        };
        match self.read(start, &["rev-parse", "--show-toplevel"]) {
            Ok(text) => {
                let trimmed = text.trim();
                Ok((!trimmed.is_empty()).then(|| PathBuf::from(trimmed)))
            }
            Err(Error::Failed {
                code: Some(128), ..
            }) => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub fn remotes(&self, repo: &Path) -> Vec<String> {
        self.read(repo, &["remote"])
            .map(|text| {
                text.lines()
                    .map(str::trim)
                    .filter(|name| !name.is_empty())
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn remote_urls(&self, repo: &Path) -> Vec<(String, String)> {
        self.read(repo, &["remote", "-v"])
            .map(|text| {
                let mut found: Vec<(String, String)> = Vec::new();
                for line in text.lines() {
                    let mut parts = line.split_whitespace();
                    if let (Some(name), Some(url)) = (parts.next(), parts.next()) {
                        if !found.iter().any(|(known, _)| known == name) {
                            found.push((name.to_string(), url.to_string()));
                        }
                    }
                }
                found
            })
            .unwrap_or_default()
    }
}
