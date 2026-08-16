use gitspy_term::{PtySession, SpawnSpec};
use std::sync::mpsc;
use std::time::Duration;

const SHELL_STARTUP_ALLOWANCE: Duration = Duration::from_secs(if cfg!(windows) { 30 } else { 5 });

fn answer_cursor_position_requests_like_a_terminal(chunk: &[u8], session: &mut PtySession) {
    if chunk.windows(4).any(|w| w == b"\x1b[6n") {
        let _ = session.write(b"\x1b[1;1R");
    }
}

fn collect(spec: SpawnSpec) -> String {
    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    let mut session = PtySession::spawn(
        spec,
        Box::new(move |bytes| {
            let _ = tx.send(bytes.to_vec());
        }),
    )
    .expect("the session must spawn");
    let mut out = Vec::new();
    while let Ok(chunk) = rx.recv_timeout(SHELL_STARTUP_ALLOWANCE) {
        answer_cursor_position_requests_like_a_terminal(&chunk, &mut session);
        out.extend(chunk);
        if String::from_utf8_lossy(&out).contains("MARK_") {
            break;
        }
    }
    session.kill();
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(unix)]
#[test]
fn shell_gets_real_tty() {
    let out = collect(SpawnSpec {
        command: Some("test -t 1 && echo MARK_TTY || echo MARK_NO".into()),
        cwd: std::env::temp_dir(),
        cols: 80,
        rows: 24,
    });
    assert!(
        out.contains("MARK_TTY"),
        "the shell must get a real TTY, output: {out}"
    );
}

#[cfg(unix)]
#[test]
fn session_starts_in_requested_cwd() {
    let wanted = std::env::temp_dir()
        .canonicalize()
        .expect("temp dir resolves");
    let out = collect(SpawnSpec {
        command: Some("echo MARK_$(pwd -P)".into()),
        cwd: wanted.clone(),
        cols: 80,
        rows: 24,
    });
    assert!(
        out.contains(&format!("MARK_{}", wanted.display())),
        "the session must start in the requested cwd, output: {out}"
    );
}

#[cfg(windows)]
#[test]
fn shell_gets_a_console_on_windows() {
    let out = collect(SpawnSpec {
        command: Some(
            "if ([Console]::IsOutputRedirected) { Write-Output MARK_NO } else { Write-Output MARK_TTY }"
                .into(),
        ),
        cwd: std::env::temp_dir(),
        cols: 80,
        rows: 24,
    });
    assert!(
        out.contains("MARK_TTY"),
        "ConPTY must give PowerShell a real console, output: {out}"
    );
}

#[cfg(windows)]
#[test]
fn session_starts_in_requested_cwd_on_windows() {
    let wanted = std::env::temp_dir();
    let out = collect(SpawnSpec {
        command: Some("Write-Output MARK_$PWD".into()),
        cwd: wanted.clone(),
        cols: 80,
        rows: 24,
    });
    let shown = wanted
        .canonicalize()
        .expect("temp dir resolves")
        .to_string_lossy()
        .trim_start_matches(r"\\?\")
        .trim_end_matches(['\\', '/'])
        .to_lowercase();
    assert!(
        out.to_lowercase().contains(&format!("mark_{shown}")),
        "the session must start in the requested cwd, output: {out}"
    );
}
