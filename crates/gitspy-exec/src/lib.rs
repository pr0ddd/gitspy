#![forbid(unsafe_code)]

pub mod changes;
pub mod env;
pub mod progress;
pub mod refs;
pub mod refusal;
pub mod status;

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

const TOKEN_VARIABLE: &str = "GITSPY_HOST_TOKEN";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Credential<'a> {
    pub url: &'a str,
    pub token: &'a str,
}

pub fn helper_for(url: &str) -> String {
    format!(
        "credential.{url}.helper=!f() {{ echo username=x-access-token; echo password=${TOKEN_VARIABLE}; }}; f"
    )
}

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
            Error::Failed { stderr, .. } => match refusal::of(stderr) {
                Some(named) => named.code(),
                None => "exec.failed",
            },
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

    fn git_dir(&self, repo: &Path) -> PathBuf {
        let dot = repo.join(".git");
        if dot.is_dir() {
            dot
        } else {
            repo.to_path_buf()
        }
    }

    fn merge_heads(&self, repo: &Path) -> Vec<String> {
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

    fn in_progress(&self, repo: &Path) -> Option<status::InProgress> {
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
        if staged {
            let before = self.file_at(repo, "HEAD", path)?;
            let after = self.file_at(repo, "", path)?;
            return Ok((before, after));
        }

        let before = self.file_at(repo, "", path)?;
        let after = std::fs::read_to_string(repo.join(path)).unwrap_or_default();
        Ok((before, after))
    }

    pub fn file_at(&self, repo: &Path, reference: &str, path: &str) -> Result<String, Error> {
        match self.read(repo, &["show", &format!("{reference}:{path}")]) {
            Ok(text) => Ok(text),
            Err(Error::Failed { .. }) => Ok(String::new()),
            Err(other) => Err(other),
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

    pub fn init(&self, path: &Path) -> Result<(), Error> {
        self.read(path, &["init"]).map(|_| ())
    }

    fn prepared(&self, credential: Option<&Credential>) -> Command {
        let environment = env::environment(self.askpass.as_deref());

        let mut command = Command::new(&self.program);
        for name in &environment.removed {
            command.env_remove(name);
        }
        for (name, value) in &environment.set {
            command.env(name, value);
        }

        if let Some(credential) = credential {
            command.env(TOKEN_VARIABLE, credential.token);
            command.arg("-c").arg(helper_for(credential.url));
        }
        command
    }

    pub fn clone_into(
        &self,
        url: &str,
        into: &Path,
        credential: Option<Credential<'_>>,
        cancel: &Cancel,
        steps: &mut dyn FnMut(progress::Step),
    ) -> Result<(), Error> {
        let mut command = self.prepared(credential.as_ref());

        let mut child = command
            .arg("clone")
            .arg("--progress")
            .arg(url)
            .arg(into)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| Error::Spawn {
                detail: e.to_string(),
            })?;

        let mut stderr = child.stderr.take().expect("stderr запрошен");
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_helper_is_bound_to_one_host_so_the_token_never_goes_elsewhere() {
        let helper = helper_for("https://github.com");
        assert!(
            helper.starts_with("credential.https://github.com.helper="),
            "без привязки к адресу токен github ушёл бы и на чужой https-хост"
        );
    }

    #[test]
    fn the_token_itself_never_appears_in_the_command_line() {
        let helper = helper_for("https://github.com");
        assert!(
            helper.contains("$GITSPY_HOST_TOKEN") && !helper.contains("gho_"),
            "командную строку видит любой ps, поэтому секрет идёт окружением"
        );
    }

    #[test]
    fn a_named_refusal_reaches_the_frontend_as_its_own_code() {
        let rejected = Error::Failed {
            code: Some(1),
            stderr: " ! [rejected]  master -> master (non-fast-forward)".to_string(),
        };
        assert_eq!(
            rejected.code(),
            "exec.rejected",
            "иначе человек читает «git failed» и не знает, что делать"
        );

        let unknown = Error::Failed {
            code: Some(128),
            stderr: "fatal: not a git repository".to_string(),
        };
        assert_eq!(unknown.code(), "exec.failed");
    }
}
