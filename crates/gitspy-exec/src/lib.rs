#![forbid(unsafe_code)]

pub mod blame;
pub mod changes;
mod create;
mod diff;
pub mod env;
pub mod filehistory;
mod history;
pub mod progress;
pub mod refs;
pub mod refusal;
mod repo;
mod run;
pub mod status;
mod worktree;

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub(crate) const TOKEN_VARIABLE: &str = "GITSPY_HOST_TOKEN";

pub fn windowless_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut command = Command::new(program);
    keep_windows_from_flashing_a_console(&mut command);
    command
}

#[cfg(windows)]
fn keep_windows_from_flashing_a_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn keep_windows_from_flashing_a_console(_: &mut Command) {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Credential<'a> {
    pub url: &'a str,
    pub username: &'a str,
    pub token: &'a str,
}

pub fn helper_for(url: &str, username: &str) -> String {
    format!(
        "credential.{url}.helper=!f() {{ echo username={username}; echo password=${TOKEN_VARIABLE}; }}; f"
    )
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConflictSides {
    pub base: String,
    pub ours: String,
    pub theirs: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeHeading {
    pub from: Option<String>,
    pub subject: String,
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

pub(crate) fn the_path_is_simply_absent(stderr: &str) -> bool {
    stderr.contains("does not exist")
        || stderr.contains("exists on disk, but not in")
        || stderr.contains("unknown revision or path not in the working tree")
}

pub(crate) fn for_each_line_lossy(source: impl std::io::Read, mut each: impl FnMut(String)) {
    let mut reader = BufReader::new(source);
    let mut buffer = Vec::new();
    loop {
        buffer.clear();
        match reader.read_until(b'\n', &mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                if buffer.last() == Some(&b'\n') {
                    buffer.pop();
                    if buffer.last() == Some(&b'\r') {
                        buffer.pop();
                    }
                }
                each(String::from_utf8_lossy(&buffer).into_owned());
            }
        }
    }
}

pub(crate) fn shown_or_absent(read: Result<String, Error>) -> Result<String, Error> {
    match read {
        Ok(text) => Ok(text),
        Err(Error::Failed { code, stderr }) => {
            if the_path_is_simply_absent(&stderr) {
                Ok(String::new())
            } else {
                Err(Error::Failed { code, stderr })
            }
        }
        Err(other) => Err(other),
    }
}

#[derive(Debug, Clone)]
pub struct Git {
    program: PathBuf,
    askpass: Option<PathBuf>,
}

impl Git {
    pub fn discover() -> Result<Self, Error> {
        if let Some(shell) = std::env::var_os("SHELL") {
            if let Some(found) = Self::found_by_the_login_shell(Path::new(&shell)) {
                return Ok(found);
            }
        }
        Self::at(Path::new("git"))
    }

    pub fn found_by_the_login_shell(shell: &Path) -> Option<Self> {
        let out = windowless_command(shell)
            .args(["-lc", "command -v git"])
            .stdin(Stdio::null())
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let named = String::from_utf8_lossy(&out.stdout);
        let program = named.trim();
        if program.is_empty() {
            return None;
        }
        Self::at(Path::new(program)).ok()
    }

    pub fn at(program: &Path) -> Result<Self, Error> {
        let found = windowless_command(program)
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_helper_is_bound_to_one_host_so_the_token_never_goes_elsewhere() {
        let helper = helper_for("https://github.com", "x-access-token");
        assert!(
            helper.starts_with("credential.https://github.com.helper="),
            "without binding to the address the github token would go to a foreign https host too"
        );
    }

    #[test]
    fn the_token_itself_never_appears_in_the_command_line() {
        let helper = helper_for("https://github.com", "x-access-token");
        assert!(
            helper.contains("$GITSPY_HOST_TOKEN") && !helper.contains("gho_"),
            "any ps sees the command line, so the secret travels through the environment"
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
            "otherwise the user reads \"git failed\" and has no idea what to do"
        );

        let unknown = Error::Failed {
            code: Some(128),
            stderr: "fatal: not a git repository".to_string(),
        };
        assert_eq!(unknown.code(), "exec.failed");
    }
}
