#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;

const NAME: &str = "Test Author";
const EMAIL: &str = "test@example.com";

fn ask_git(path: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .output()
        .expect("git запускается");
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

pub fn seeds_at(path: &Path) -> Vec<gitspy_repo::RefSeed> {
    let mut seeds: Vec<gitspy_repo::RefSeed> = ask_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname) %(objecttype) %(objectname) %(*objecttype) %(*objectname)",
        ],
    )
    .lines()
    .filter_map(|line| {
        let f: Vec<&str> = line.split_whitespace().collect();
        if f.first() == Some(&"refs/stash") {
            return None;
        }
        let (kind, oid) = match f.len() {
            5 => (f[3], f[4]),
            3 => (f[1], f[2]),
            _ => return None,
        };
        (kind == "commit").then(|| gitspy_repo::RefSeed {
            oid: oid.to_string(),
            is_stash: false,
        })
    })
    .collect();

    seeds.extend(
        ask_git(path, &["stash", "list", "--format=%H"])
            .lines()
            .filter(|l| !l.is_empty())
            .map(|oid| gitspy_repo::RefSeed {
                oid: oid.to_string(),
                is_stash: true,
            }),
    );

    seeds
}

pub fn head_at(path: &Path) -> Option<String> {
    let oid = ask_git(path, &["rev-parse", "-q", "--verify", "HEAD"]);
    (!oid.is_empty()).then_some(oid)
}

const EPOCH: i64 = 1577836800;

pub struct Fixture {
    dir: TempDir,

    seq: std::cell::Cell<i64>,
}

impl Fixture {
    pub fn new() -> Self {
        let dir = TempDir::new().expect("временный каталог");
        let fixture = Self {
            dir,
            seq: std::cell::Cell::new(0),
        };
        fixture.run(&["init", "-b", "main"]);
        fixture.run(&["config", "user.name", NAME]);
        fixture.run(&["config", "user.email", EMAIL]);
        fixture.run(&["config", "commit.gpgsign", "false"]);
        fixture.run(&["config", "tag.gpgsign", "false"]);
        fixture
    }

    pub fn path(&self) -> &Path {
        self.dir.path()
    }

    pub fn run(&self, args: &[&str]) -> String {
        let out = self.try_run(args);
        match out {
            Ok(s) => s,
            Err(e) => panic!("git {args:?} не отработал: {e}"),
        }
    }

    pub fn try_run(&self, args: &[&str]) -> Result<String, String> {
        self.run_with_stdin(args, None)
    }

    pub fn run_with_stdin(&self, args: &[&str], stdin: Option<&str>) -> Result<String, String> {
        use std::io::Write;
        use std::process::Stdio;

        let mut cmd = Command::new("git");
        cmd.arg("-C")
            .arg(self.dir.path())
            .args(args)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .env("GIT_AUTHOR_NAME", NAME)
            .env("GIT_AUTHOR_EMAIL", EMAIL)
            .env("GIT_COMMITTER_NAME", NAME)
            .env("GIT_COMMITTER_EMAIL", EMAIL)
            .stdin(if stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        if let Some(text) = stdin {
            child
                .stdin
                .as_mut()
                .expect("stdin открыт")
                .write_all(text.as_bytes())
                .map_err(|e| e.to_string())?;
        }
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    }

    pub fn commit(&self, message: &str) -> String {
        let n = self.seq.get();
        self.seq.set(n + 1);
        self.commit_at(message, EPOCH + n * 60)
    }

    pub fn commit_at(&self, message: &str, epoch: i64) -> String {
        let date = format!("{epoch} +0000");
        let mut cmd = Command::new("git");
        cmd.arg("-C")
            .arg(self.dir.path())
            .args(["commit", "--allow-empty", "-m", message])
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .env("GIT_AUTHOR_NAME", NAME)
            .env("GIT_AUTHOR_EMAIL", EMAIL)
            .env("GIT_COMMITTER_NAME", NAME)
            .env("GIT_COMMITTER_EMAIL", EMAIL)
            .env("GIT_AUTHOR_DATE", &date)
            .env("GIT_COMMITTER_DATE", &date);
        let out = cmd.output().expect("git commit запускается");
        assert!(
            out.status.success(),
            "git commit не отработал: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        self.run(&["rev-parse", "HEAD"])
    }

    pub fn merge(&self, branch: &str, message: &str) -> String {
        let n = self.seq.get();
        self.seq.set(n + 1);
        let date = format!("{} +0000", EPOCH + n * 60);
        let mut cmd = Command::new("git");
        cmd.arg("-C")
            .arg(self.dir.path())
            .args(["merge", "--no-ff", "--no-edit", "-m", message, branch])
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .env("GIT_AUTHOR_NAME", NAME)
            .env("GIT_AUTHOR_EMAIL", EMAIL)
            .env("GIT_COMMITTER_NAME", NAME)
            .env("GIT_COMMITTER_EMAIL", EMAIL)
            .env("GIT_AUTHOR_DATE", &date)
            .env("GIT_COMMITTER_DATE", &date);
        let out = cmd.output().expect("git merge запускается");
        assert!(
            out.status.success(),
            "git merge не отработал: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        self.run(&["rev-parse", "HEAD"])
    }

    pub fn write_file(&self, name: &str, content: &str) {
        std::fs::write(self.dir.path().join(name), content).expect("файл пишется");
    }

    pub fn commit_file(&self, name: &str, content: &str, message: &str) -> String {
        self.write_file(name, content);
        self.run(&["add", name]);
        self.commit(message)
    }

    pub fn stash(&self, message: &str, untracked: bool) -> String {
        let n = self.seq.get();
        self.seq.set(n + 1);
        let date = format!("{} +0000", EPOCH + n * 60);
        let mut args = vec!["stash", "push", "-m", message];
        if untracked {
            args.push("-u");
        }

        let mut cmd = Command::new("git");
        cmd.arg("-C")
            .arg(self.dir.path())
            .args(&args)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .env("GIT_AUTHOR_NAME", NAME)
            .env("GIT_AUTHOR_EMAIL", EMAIL)
            .env("GIT_COMMITTER_NAME", NAME)
            .env("GIT_COMMITTER_EMAIL", EMAIL)
            .env("GIT_AUTHOR_DATE", &date)
            .env("GIT_COMMITTER_DATE", &date);
        let out = cmd.output().expect("git stash запускается");
        assert!(
            out.status.success(),
            "git stash не отработал: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        self.run(&["rev-parse", "refs/stash"])
    }

    pub fn write_blob(&self, content: &str) -> String {
        self.run_with_stdin(&["hash-object", "-w", "--stdin"], Some(content))
            .expect("blob записывается")
    }

    pub fn git_date_order(&self) -> Vec<String> {
        self.run(&["log", "--all", "--date-order", "--format=%H"])
            .lines()
            .map(str::to_string)
            .collect()
    }

    pub fn git_refs(&self) -> Vec<(String, String)> {
        self.run(&["for-each-ref", "--format=%(refname) %(objectname)"])
            .lines()
            .filter_map(|l| l.split_once(' '))
            .map(|(a, b)| (a.to_string(), b.to_string()))
            .collect()
    }

    pub fn clone(&self, args: &[&str]) -> (TempDir, PathBuf) {
        let source = format!("file://{}", self.dir.path().display());
        let dest = TempDir::new().expect("временный каталог");
        let path = dest.path().join("clone");

        let out = Command::new("git")
            .arg("clone")
            .args(args)
            .arg(&source)
            .arg(&path)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .output()
            .expect("git clone запускается");
        assert!(
            out.status.success(),
            "git clone не отработал: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        (dest, path)
    }
}
