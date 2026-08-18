use crate::{
    env, for_each_line_lossy, helper_for, windowless_command, Cancel, Credential, Error, Event,
    Git, Outcome, TOKEN_VARIABLE,
};
use std::path::Path;
use std::process::{Command, Stdio};

impl Git {
    pub(crate) fn prepared(&self, credential: Option<&Credential>) -> Command {
        let environment = env::environment(self.askpass.as_deref());

        let mut command = windowless_command(&self.program);
        for name in &environment.removed {
            command.env_remove(name);
        }
        for (name, value) in &environment.set {
            command.env(name, value);
        }

        if let Some(credential) = credential {
            command.env(TOKEN_VARIABLE, credential.token);
            command
                .arg("-c")
                .arg(helper_for(credential.url, credential.username));
        }
        command
    }

    pub fn run(
        &self,
        repo: &Path,
        args: &[&str],
        cancel: &Cancel,
        events: &mut dyn FnMut(Event),
    ) -> Result<Outcome, Error> {
        self.run_as(repo, args, None, cancel, events)
    }

    pub fn run_as(
        &self,
        repo: &Path,
        args: &[&str],
        credential: Option<Credential<'_>>,
        cancel: &Cancel,
        events: &mut dyn FnMut(Event),
    ) -> Result<Outcome, Error> {
        let mut command = self.prepared(credential.as_ref());
        command
            .arg("-C")
            .arg(repo)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        events(Event::Started {
            program: self.program.display().to_string(),
            args: args.iter().map(|a| (*a).to_string()).collect(),
        });

        let mut child = command.spawn().map_err(|e| Error::Spawn {
            detail: e.to_string(),
        })?;

        let stdout = child.stdout.take().expect("stdout was piped");
        let stderr = child.stderr.take().expect("stderr was piped");

        let collected_err = std::thread::scope(|scope| {
            let err = scope.spawn(|| {
                let mut lines = Vec::new();
                for_each_line_lossy(stderr, |line| lines.push(line));
                lines
            });

            let mut out = Vec::new();
            for_each_line_lossy(stdout, |line| {
                events(Event::Line {
                    stderr: false,
                    text: line.clone(),
                });
                out.push(line);
            });

            let err = err.join().unwrap_or_default();
            for line in &err {
                events(Event::Line {
                    stderr: true,
                    text: line.clone(),
                });
            }
            (out, err)
        });

        let (out_lines, err_lines) = collected_err;

        if cancel.asked() {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Error::Cancelled);
        }

        let status = child.wait().map_err(|e| Error::Spawn {
            detail: e.to_string(),
        })?;

        let stdout = out_lines.join("\n");
        let stderr = err_lines.join("\n");
        let code = status.code().unwrap_or(-1);
        events(Event::Finished { code });

        if !status.success() {
            return Err(Error::Failed {
                code: status.code(),
                stderr,
            });
        }

        Ok(Outcome {
            code,
            stdout,
            stderr,
        })
    }

    pub(crate) fn read(&self, repo: &Path, args: &[&str]) -> Result<String, Error> {
        self.run(repo, args, &Cancel::new(), &mut |_| {})
            .map(|outcome| outcome.stdout)
    }

    pub(crate) fn read_raw(&self, repo: &Path, args: &[&str]) -> Result<String, Error> {
        let out = self
            .prepared(None)
            .arg("-C")
            .arg(repo)
            .args(args)
            .stdin(Stdio::null())
            .output()
            .map_err(|e| Error::Spawn {
                detail: e.to_string(),
            })?;
        if !out.status.success() {
            return Err(Error::Failed {
                code: out.status.code(),
                stderr: String::from_utf8_lossy(&out.stderr).to_string(),
            });
        }
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    }
}
