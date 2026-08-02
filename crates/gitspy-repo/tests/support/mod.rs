//! Сборщик репозиториев-фикстур поверх настоящего git.
//!
//! Всё детерминировано: фиксированные автор, коммиттер и даты, поэтому хеши
//! воспроизводимы от запуска к запуску. Глобальный и системный конфиг
//! отключены — иначе настройки машины разработчика протекают в тесты.

#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;

const NAME: &str = "Test Author";
const EMAIL: &str = "test@example.com";
/// 2020-01-01T00:00:00Z — от него отсчитываются все даты фикстур.
const EPOCH: i64 = 1577836800;

pub struct Fixture {
    dir: TempDir,
    /// Сколько коммитов создано: даёт возрастающие даты по умолчанию.
    seq: std::cell::Cell<i64>,
}

impl Fixture {
    pub fn new() -> Self {
        let dir = TempDir::new().expect("временный каталог");
        let fixture = Self { dir, seq: std::cell::Cell::new(0) };
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

    /// Запускает git и возвращает stdout. Падает, если git вернул ошибку.
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
            // Настройки машины разработчика в тесты не протекают.
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .env("GIT_AUTHOR_NAME", NAME)
            .env("GIT_AUTHOR_EMAIL", EMAIL)
            .env("GIT_COMMITTER_NAME", NAME)
            .env("GIT_COMMITTER_EMAIL", EMAIL)
            .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
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

    /// Коммит с автоматически возрастающей датой.
    pub fn commit(&self, message: &str) -> String {
        let n = self.seq.get();
        self.seq.set(n + 1);
        self.commit_at(message, EPOCH + n * 60)
    }

    /// Коммит с явной датой — для проверки перекоса часов.
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

    /// Мерж с явной датой, чтобы порядок был предсказуем.
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

    /// Кладёт blob в базу объектов и возвращает его хеш.
    pub fn write_blob(&self, content: &str) -> String {
        self.run_with_stdin(&["hash-object", "-w", "--stdin"], Some(content))
            .expect("blob записывается")
    }

    /// Хеши всей истории в порядке `git log --all --date-order`.
    pub fn git_date_order(&self) -> Vec<String> {
        self.run(&["log", "--all", "--date-order", "--format=%H"])
            .lines()
            .map(str::to_string)
            .collect()
    }

    /// Ссылки в виде «полное имя → хеш, на который она в итоге указывает».
    pub fn git_refs(&self) -> Vec<(String, String)> {
        self.run(&["for-each-ref", "--format=%(refname) %(objectname)"])
            .lines()
            .filter_map(|l| l.split_once(' '))
            .map(|(a, b)| (a.to_string(), b.to_string()))
            .collect()
    }

    /// Отдельный каталог рядом с фикстурой — для bare-клонов и shallow.
    pub fn sibling(&self, name: &str) -> PathBuf {
        self.dir.path().parent().expect("родитель есть").join(name)
    }
}
