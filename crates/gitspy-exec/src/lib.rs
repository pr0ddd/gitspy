#![forbid(unsafe_code)]

pub mod changes;
pub mod env;

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    GitNotFound,
    Spawn { detail: String },
    Failed { code: Option<i32>, stderr: String },
    Cancelled,
}

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Error::GitNotFound => "exec.gitNotFound",
            Error::Spawn { .. } => "exec.spawn",
            Error::Failed { .. } => "exec.failed",
            Error::Cancelled => "exec.cancelled",
        }
    }

    pub fn detail(&self) -> Option<String> {
        match self {
            Error::GitNotFound | Error::Cancelled => None,
            Error::Spawn { detail } => Some(detail.clone()),
            Error::Failed { stderr, .. } => Some(stderr.clone()),
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::GitNotFound => write!(f, "exec.gitNotFound"),
            Error::Spawn { detail } => write!(f, "exec.spawn: {detail}"),
            Error::Failed { code, stderr } => write!(f, "exec.failed {code:?}: {stderr}"),
            Error::Cancelled => write!(f, "exec.cancelled"),
        }
    }
}

impl std::error::Error for Error {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Event {
    Started { program: String, args: Vec<String> },
    Line { stderr: bool, text: String },
    Finished { code: i32 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Default)]
pub struct Cancel(Arc<AtomicBool>);

impl Cancel {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn ask(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn asked(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[derive(Debug, Clone)]
pub struct Git {
    program: PathBuf,
    askpass: Option<PathBuf>,
}

impl Git {
    pub fn discover() -> Result<Self, Error> {
        Self::at(Path::new("git"))
    }

    pub fn at(program: &Path) -> Result<Self, Error> {
        let found = Command::new(program)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);

        if !found {
            return Err(Error::GitNotFound);
        }
        Ok(Self {
            program: program.to_path_buf(),
            askpass: None,
        })
    }

    pub fn with_askpass(mut self, helper: PathBuf) -> Self {
        self.askpass = Some(helper);
        self
    }

    pub fn program(&self) -> &Path {
        &self.program
    }

    fn read(&self, repo: &Path, args: &[&str]) -> Result<String, Error> {
        self.run(repo, args, &Cancel::new(), &mut |_| {})
            .map(|outcome| outcome.stdout)
    }

    fn has_parent(&self, repo: &Path, commit: &str) -> bool {
        self.read(
            repo,
            &["rev-parse", "-q", "--verify", &format!("{commit}^1")],
        )
        .is_ok()
    }

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

    pub fn file_at(&self, repo: &Path, reference: &str, path: &str) -> Result<String, Error> {
        match self.read(repo, &["show", &format!("{reference}:{path}")]) {
            Ok(text) => Ok(text),
            Err(Error::Failed { .. }) => Ok(String::new()),
            Err(other) => Err(other),
        }
    }

    pub fn run(
        &self,
        repo: &Path,
        args: &[&str],
        cancel: &Cancel,
        events: &mut dyn FnMut(Event),
    ) -> Result<Outcome, Error> {
        let environment = env::environment(self.askpass.as_deref());

        let mut command = Command::new(&self.program);
        command
            .arg("-C")
            .arg(repo)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for name in &environment.removed {
            command.env_remove(name);
        }
        for (name, value) in &environment.set {
            command.env(name, value);
        }

        events(Event::Started {
            program: self.program.display().to_string(),
            args: args.iter().map(|a| (*a).to_string()).collect(),
        });

        let mut child = command.spawn().map_err(|e| Error::Spawn {
            detail: e.to_string(),
        })?;

        let stdout = child.stdout.take().expect("stdout запрошен");
        let stderr = child.stderr.take().expect("stderr запрошен");

        let collected_err = std::thread::scope(|scope| {
            let err = scope.spawn(|| {
                let mut lines = Vec::new();
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    lines.push(line);
                }
                lines
            });

            let mut out = Vec::new();
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                events(Event::Line {
                    stderr: false,
                    text: line.clone(),
                });
                out.push(line);
            }

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
}
