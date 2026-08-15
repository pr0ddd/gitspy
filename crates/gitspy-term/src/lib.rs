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

pub fn login_shell(env_shell: Option<&str>, exists: impl Fn(&str) -> bool) -> String {
    env_shell
        .filter(|shell| !shell.is_empty() && exists(shell))
        .map(str::to_string)
        .unwrap_or_else(|| "/bin/sh".to_string())
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
        let shell = login_shell(std::env::var("SHELL").ok().as_deref(), |path| {
            std::path::Path::new(path).exists()
        });
        let mut cmd = CommandBuilder::new(&shell);
        match &spec.command {
            Some(line) => cmd.args(["-ilc", line]),
            None => cmd.args(["-il"]),
        };
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
    use super::login_shell;

    #[test]
    fn the_users_shell_wins_when_it_exists() {
        assert_eq!(
            login_shell(Some("/usr/bin/fish"), |_| true),
            "/usr/bin/fish"
        );
    }

    #[test]
    fn a_missing_or_empty_shell_falls_back_to_sh() {
        assert_eq!(login_shell(Some("/bin/zsh"), |_| false), "/bin/sh");
        assert_eq!(login_shell(Some(""), |_| true), "/bin/sh");
        assert_eq!(login_shell(None, |_| true), "/bin/sh");
    }
}
