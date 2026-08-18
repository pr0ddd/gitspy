use crate::{progress, Cancel, Credential, Error, Git};
use std::io::Read;
use std::path::Path;
use std::process::Stdio;

impl Git {
    pub fn init(&self, path: &Path, branch: Option<&str>) -> Result<(), Error> {
        match branch {
            Some(name) => self.read(path, &["init", "-b", name]).map(|_| ()),
            None => self.read(path, &["init"]).map(|_| ()),
        }
    }

    pub fn first_commit(&self, path: &Path, message: &str) -> Result<(), Error> {
        self.read(path, &["add", "-A"])?;
        self.read(path, &["commit", "-m", message]).map(|_| ())
    }

    pub fn rename_unborn_branch(&self, path: &Path, branch: &str) -> Result<(), Error> {
        self.read(
            path,
            &["symbolic-ref", "HEAD", &format!("refs/heads/{branch}")],
        )
        .map(|_| ())
    }

    pub fn clone_into(
        &self,
        url: &str,
        into: &Path,
        shallow: bool,
        credential: Option<Credential<'_>>,
        cancel: &Cancel,
        steps: &mut dyn FnMut(progress::Step),
    ) -> Result<(), Error> {
        let mut command = self.prepared(credential.as_ref());
        command.arg("clone").arg("--progress");
        if shallow {
            command.arg("--depth").arg("1");
        }

        let mut child = command
            .arg(url)
            .arg(into)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| Error::Spawn {
                detail: e.to_string(),
            })?;

        let mut stderr = child.stderr.take().expect("stderr was piped");
        let mut said = Vec::new();
        let mut buffer = [0u8; 4096];
        let mut last = None;

        loop {
            let read = stderr.read(&mut buffer).unwrap_or(0);
            if read == 0 {
                break;
            }
            said.extend_from_slice(&buffer[..read]);

            let chunk = String::from_utf8_lossy(&buffer[..read]).into_owned();
            for line in progress::split_progress(&chunk) {
                let Some(step) = progress::parse(line) else {
                    continue;
                };
                if last != Some(step) {
                    last = Some(step);
                    steps(step);
                }
            }

            if cancel.asked() {
                let _ = child.kill();
                let _ = child.wait();
                return Err(Error::Cancelled);
            }
        }

        let status = child.wait().map_err(|e| Error::Spawn {
            detail: e.to_string(),
        })?;

        if !status.success() {
            return Err(Error::Failed {
                code: status.code(),
                stderr: String::from_utf8_lossy(&said).into_owned(),
            });
        }
        Ok(())
    }
}
