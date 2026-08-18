use crate::{changes, Error, Git};
use std::path::Path;
use std::process::Stdio;

impl Git {
    pub fn commit_files(
        &self,
        repo: &Path,
        commit: &str,
    ) -> Result<Vec<changes::ChangedFile>, Error> {
        let parent = format!("{commit}^1");
        let against_parent = self.has_parent(repo, commit);

        let ends: Vec<&str> = if against_parent {
            vec![parent.as_str(), commit]
        } else {
            vec!["--root", commit]
        };

        let query = |what: &str| {
            let mut args = vec![
                "diff-tree",
                "--no-commit-id",
                "-r",
                "-z",
                what,
                "--find-renames",
            ];
            args.extend_from_slice(&ends);
            self.read(repo, &args)
        };

        let names = query("--name-status")?;
        let counts = query("--numstat")?;

        Ok(changes::merge(
            changes::parse_name_status(&names),
            changes::parse_numstat(&counts),
        ))
    }

    pub fn diff_unified(&self, repo: &Path, path: &str, staged: bool) -> Result<String, Error> {
        let mut args = vec!["diff", "--no-color", "--no-ext-diff"];
        if staged {
            args.push("--cached");
        }
        args.extend(["--", path]);
        self.read_raw(repo, &args)
    }

    pub fn staged_diff(&self, repo: &Path) -> Result<String, Error> {
        self.read_raw(repo, &["diff", "--cached", "--no-color", "--no-ext-diff"])
    }

    pub fn commit_diff_unified(
        &self,
        repo: &Path,
        hash: &str,
        path: &str,
    ) -> Result<String, Error> {
        let range = format!("{hash}^!");
        let args = vec![
            "diff-tree",
            "--no-color",
            "--no-ext-diff",
            "--root",
            "-p",
            "--unified=3",
            &range,
            "--",
            path,
        ];
        self.read_raw(repo, &args)
    }

    pub fn apply_patch(
        &self,
        repo: &Path,
        patch: &str,
        cached: bool,
        reverse: bool,
    ) -> Result<(), Error> {
        let spawn_error = |e: std::io::Error| Error::Spawn {
            detail: e.to_string(),
        };
        let mut args = vec!["apply", "--whitespace=nowarn"];
        if cached {
            args.push("--cached");
        }
        if reverse {
            args.push("-R");
        }

        let mut child = self
            .prepared(None)
            .arg("-C")
            .arg(repo)
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(spawn_error)?;

        use std::io::Write;
        child
            .stdin
            .take()
            .expect("stdin was piped")
            .write_all(patch.as_bytes())
            .map_err(spawn_error)?;

        let out = child.wait_with_output().map_err(spawn_error)?;
        if !out.status.success() {
            return Err(Error::Failed {
                code: out.status.code(),
                stderr: String::from_utf8_lossy(&out.stderr).to_string(),
            });
        }
        Ok(())
    }
}
