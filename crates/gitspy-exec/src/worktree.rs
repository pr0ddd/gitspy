use crate::{shown_or_absent, status, ConflictSides, Error, Git, MergeHeading};
use std::path::Path;
use std::process::Stdio;

impl Git {
    pub fn status(&self, repo: &Path) -> Result<status::WorkingTree, Error> {
        let raw = self.read(
            repo,
            &[
                "status",
                "--porcelain=v2",
                "-z",
                "--branch",
                "--untracked-files=all",
                "--renames",
            ],
        )?;
        let mut tree = status::parse(&raw);
        tree.extra_parents = self.merge_heads(repo);
        tree.in_progress = self.in_progress(repo);
        Ok(tree)
    }

    pub(crate) fn merge_heads(&self, repo: &Path) -> Vec<String> {
        std::fs::read_to_string(self.git_dir(repo).join("MERGE_HEAD"))
            .map(|text| {
                text.lines()
                    .map(str::trim)
                    .filter(|l| !l.is_empty())
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    }

    pub(crate) fn in_progress(&self, repo: &Path) -> Option<status::InProgress> {
        let dir = self.git_dir(repo);
        let has = |name: &str| dir.join(name).exists();

        if has("MERGE_HEAD") {
            return Some(status::InProgress::Merge);
        }
        if has("rebase-merge") || has("rebase-apply") {
            return Some(status::InProgress::Rebase);
        }
        if has("CHERRY_PICK_HEAD") {
            return Some(status::InProgress::CherryPick);
        }
        if has("REVERT_HEAD") {
            return Some(status::InProgress::Revert);
        }
        if has("BISECT_LOG") {
            return Some(status::InProgress::Bisect);
        }
        None
    }

    pub fn working_tree_sides(
        &self,
        repo: &Path,
        path: &str,
        staged: bool,
    ) -> Result<(String, String), Error> {
        if let Some(pointers) = self.gitlink_sides(repo, path, staged)? {
            return Ok(pointers);
        }
        if staged {
            let before = self.file_at(repo, "HEAD", path)?;
            let after = self.file_at(repo, "", path)?;
            return Ok((before, after));
        }

        let before = self.file_at(repo, "", path)?;
        let after = std::fs::read_to_string(repo.join(path)).unwrap_or_default();
        Ok((before, after))
    }

    pub fn merge_heading(&self, repo: &Path) -> Option<MergeHeading> {
        let text = std::fs::read_to_string(self.git_dir(repo).join("MERGE_MSG")).ok()?;
        let subject = text.lines().next()?.to_string();
        let from = subject
            .split('\'')
            .nth(1)
            .filter(|name| !name.is_empty())
            .map(str::to_string);
        Some(MergeHeading { from, subject })
    }

    pub fn conflict_sides(&self, repo: &Path, path: &str) -> Result<ConflictSides, Error> {
        Ok(ConflictSides {
            base: self.stage_content(repo, 1, path)?,
            ours: self.stage_content(repo, 2, path)?,
            theirs: self.stage_content(repo, 3, path)?,
        })
    }

    pub(crate) fn stage_content(
        &self,
        repo: &Path,
        stage: u8,
        path: &str,
    ) -> Result<String, Error> {
        shown_or_absent(self.read_raw(repo, &["show", &format!(":{stage}:{path}")]))
    }

    pub fn conflict_merged(&self, repo: &Path, path: &str) -> Result<String, Error> {
        let spawn_error = |e: std::io::Error| Error::Spawn {
            detail: e.to_string(),
        };
        let sides = self.conflict_sides(repo, path)?;
        let dir = tempfile::tempdir().map_err(spawn_error)?;
        let stage = |name: &str, text: &str| -> Result<std::path::PathBuf, Error> {
            let file = dir.path().join(name);
            std::fs::write(&file, text).map_err(spawn_error)?;
            Ok(file)
        };

        let out = self
            .prepared(None)
            .arg("-C")
            .arg(repo)
            .args(["merge-file", "-p", "--diff3"])
            .arg(stage("ours", &sides.ours)?)
            .arg(stage("base", &sides.base)?)
            .arg(stage("theirs", &sides.theirs)?)
            .stdin(Stdio::null())
            .output()
            .map_err(spawn_error)?;

        match out.status.code() {
            Some(conflicts) if conflicts >= 0 => {
                Ok(String::from_utf8_lossy(&out.stdout).to_string())
            }
            code => Err(Error::Failed {
                code,
                stderr: String::from_utf8_lossy(&out.stderr).to_string(),
            }),
        }
    }

    pub(crate) fn gitlink_sides(
        &self,
        repo: &Path,
        path: &str,
        staged: bool,
    ) -> Result<Option<(String, String)>, Error> {
        let listed = self.read(repo, &["ls-files", "-s", "--", path])?;
        if listed.split_whitespace().next() != Some("160000") {
            return Ok(None);
        }

        let diff = self.diff_unified(repo, path, staged)?;
        let pointers = |sign: char| {
            diff.lines()
                .filter_map(|line| line.strip_prefix(sign))
                .filter(|rest| rest.starts_with("Subproject commit "))
                .map(|rest| format!("{rest}\n"))
                .collect::<String>()
        };

        let old = pointers('-');
        let new = pointers('+');
        if old.is_empty() && new.is_empty() {
            return Ok(None);
        }
        Ok(Some((old, new)))
    }

    pub fn write_file(&self, repo: &Path, path: &str, content: &str) -> Result<(), Error> {
        std::fs::write(repo.join(path), content).map_err(|e| Error::Spawn {
            detail: e.to_string(),
        })
    }

    pub fn resolve_file(&self, repo: &Path, path: &str, content: &str) -> Result<(), Error> {
        self.write_file(repo, path, content)?;
        self.read(repo, &["add", "--", path]).map(|_| ())
    }

    pub fn file_at(&self, repo: &Path, reference: &str, path: &str) -> Result<String, Error> {
        shown_or_absent(self.read(repo, &["show", &format!("{reference}:{path}")]))
    }
}
