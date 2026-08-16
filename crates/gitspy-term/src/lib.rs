use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::path::PathBuf;

pub type OnBytes = Box<dyn FnMut(&[u8]) + Send>;

pub struct SpawnSpec {
    pub command: Option<String>,
    pub cwd: PathBuf,
    pub cols: u16,
    pub rows: u16,
}

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShellFamily {
    Posix,
    PowerShell,
    Cmd,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Shell {
    pub program: String,
    pub family: ShellFamily,
}

impl Shell {
    pub fn args(&self, command: Option<&str>) -> Vec<String> {
        let owned = |parts: &[&str]| parts.iter().map(|p| (*p).to_string()).collect::<Vec<_>>();
        match (&self.family, command) {
            (ShellFamily::Posix, None) => owned(&["-il"]),
            (ShellFamily::Posix, Some(line)) => owned(&["-ilc", line]),
            (ShellFamily::PowerShell, None) => owned(&["-NoLogo"]),
            (ShellFamily::PowerShell, Some(line)) => owned(&["-NoLogo", "-Command", line]),
            (ShellFamily::Cmd, None) => vec![],
            (ShellFamily::Cmd, Some(line)) => owned(&["/C", line]),
        }
    }
}

pub struct ShellEnvironment<'a> {
    pub windows: bool,
    pub shell: Option<&'a str>,
    pub comspec: Option<&'a str>,
}

pub fn login_shell(
    env: ShellEnvironment<'_>,
    exists: impl Fn(&str) -> bool,
    on_path: impl Fn(&str) -> bool,
) -> Shell {
    if env.windows {
        for candidate in ["pwsh.exe", "powershell.exe"] {
            if on_path(candidate) {
                return Shell {
                    program: candidate.to_string(),
                    family: ShellFamily::PowerShell,
                };
            }
        }
        return Shell {
            program: env
                .comspec
                .filter(|path| !path.is_empty())
                .unwrap_or("cmd.exe")
                .to_string(),
            family: ShellFamily::Cmd,
        };
    }
    Shell {
        program: env
            .shell
            .filter(|shell| !shell.is_empty() && exists(shell))
            .unwrap_or("/bin/sh")
            .to_string(),
        family: ShellFamily::Posix,
    }
}

fn found_on_path(name: &str) -> bool {
    std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).any(|dir| dir.join(name).is_file()))
        .unwrap_or(false)
}

impl PtySession {
    pub fn spawn(spec: SpawnSpec, mut on_bytes: OnBytes) -> Result<PtySession, String> {
        let pty = native_pty_system();
        let pair = pty
            .openpty(PtySize {
                rows: spec.rows,
                cols: spec.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        let env_shell = std::env::var("SHELL").ok();
        let comspec = std::env::var("COMSPEC").ok();
        let shell = login_shell(
            ShellEnvironment {
                windows: cfg!(windows),
                shell: env_shell.as_deref(),
                comspec: comspec.as_deref(),
            },
            |path| std::path::Path::new(path).exists(),
            found_on_path,
        );
        let mut cmd = CommandBuilder::new(&shell.program);
        cmd.args(shell.args(spec.command.as_deref()));
        cmd.cwd(&spec.cwd);
        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        std::thread::spawn(move || {
            let mut buf = [0u8; 65536];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => on_bytes(&buf[..n]),
                }
            }
        });
        Ok(PtySession {
            writer,
            master: pair.master,
            child,
        })
    }

    pub fn write(&mut self, data: &[u8]) -> Result<(), String> {
        self.writer.write_all(data).map_err(|e| e.to_string())
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::{login_shell, Shell, ShellEnvironment, ShellFamily};

    fn unix(shell: Option<&str>) -> ShellEnvironment<'_> {
        ShellEnvironment {
            windows: false,
            shell,
            comspec: None,
        }
    }

    fn windows(comspec: Option<&str>) -> ShellEnvironment<'_> {
        ShellEnvironment {
            windows: true,
            shell: None,
            comspec,
        }
    }

    #[test]
    fn the_users_shell_wins_when_it_exists() {
        assert_eq!(
            login_shell(unix(Some("/usr/bin/fish")), |_| true, |_| false),
            Shell {
                program: "/usr/bin/fish".into(),
                family: ShellFamily::Posix
            }
        );
    }

    #[test]
    fn a_missing_or_empty_shell_falls_back_to_sh() {
        for env_shell in [Some("/bin/zsh"), Some(""), None] {
            let shell = login_shell(
                unix(env_shell),
                |_| env_shell != Some("/bin/zsh"),
                |_| false,
            );
            assert_eq!(shell.program, "/bin/sh");
        }
    }

    #[test]
    fn a_posix_shell_is_started_as_an_interactive_login_shell() {
        let shell = login_shell(unix(Some("/bin/zsh")), |_| true, |_| false);
        assert_eq!(shell.args(None), ["-il"]);
        assert_eq!(
            shell.args(Some("git status")),
            ["-ilc", "git status"],
            "a one-off command still runs inside the login shell so PATH and aliases apply"
        );
    }

    #[test]
    fn on_windows_powershell_is_preferred_and_the_newest_one_wins() {
        let shell = login_shell(
            windows(Some("C:\\Windows\\system32\\cmd.exe")),
            |_| true,
            |name| name == "pwsh.exe" || name == "powershell.exe",
        );
        assert_eq!(
            shell.program, "pwsh.exe",
            "PowerShell 7 over Windows PowerShell 5"
        );
        assert_eq!(shell.family, ShellFamily::PowerShell);
        assert_eq!(shell.args(None), ["-NoLogo"]);
        assert_eq!(
            shell.args(Some("git status")),
            ["-NoLogo", "-Command", "git status"]
        );

        let older = login_shell(windows(None), |_| true, |name| name == "powershell.exe");
        assert_eq!(older.program, "powershell.exe");
    }

    #[test]
    fn on_windows_without_powershell_the_command_processor_from_comspec_is_used() {
        let shell = login_shell(
            windows(Some("C:\\Windows\\system32\\cmd.exe")),
            |_| true,
            |_| false,
        );
        assert_eq!(shell.program, "C:\\Windows\\system32\\cmd.exe");
        assert_eq!(shell.family, ShellFamily::Cmd);
        assert_eq!(shell.args(None), Vec::<String>::new());
        assert_eq!(shell.args(Some("git status")), ["/C", "git status"]);

        let bare = login_shell(windows(None), |_| true, |_| false);
        assert_eq!(
            bare.program, "cmd.exe",
            "COMSPEC unset still yields a working shell name"
        );
    }
}
