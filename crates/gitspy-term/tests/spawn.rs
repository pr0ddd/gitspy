use gitspy_term::{PtySession, SpawnSpec};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

fn collect(spec: SpawnSpec) -> String {
    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    let mut session = PtySession::spawn(
        spec,
        Box::new(move |bytes| {
            let _ = tx.send(bytes.to_vec());
        }),
    )
    .expect("сессия должна запускаться");
    let mut out = Vec::new();
    while let Ok(chunk) = rx.recv_timeout(Duration::from_secs(5)) {
        out.extend(chunk);
        if String::from_utf8_lossy(&out).contains("MARK_") {
            break;
        }
    }
    session.kill();
    String::from_utf8_lossy(&out).into_owned()
}

#[test]
fn shell_gets_real_tty() {
    let out = collect(SpawnSpec {
        command: Some("test -t 1 && echo MARK_TTY || echo MARK_NO".into()),
        cwd: PathBuf::from("/tmp"),
        cols: 80,
        rows: 24,
        shell_integration: false,
    });
    assert!(
        out.contains("MARK_TTY"),
        "шелл обязан получить настоящий TTY, вывод: {out}"
    );
}

#[test]
fn session_starts_in_requested_cwd() {
    let out = collect(SpawnSpec {
        command: Some("echo MARK_$(pwd)".into()),
        cwd: PathBuf::from("/private/tmp"),
        cols: 80,
        rows: 24,
        shell_integration: false,
    });
    assert!(
        out.contains("MARK_/private/tmp"),
        "cwd сессии обязан быть запрошенным, вывод: {out}"
    );
}

#[test]
fn shell_integration_emits_prompt_marks() {
    let out = collect(SpawnSpec {
        command: Some("echo MARK_DONE".into()),
        cwd: PathBuf::from("/tmp"),
        cols: 80,
        rows: 24,
        shell_integration: true,
    });
    assert!(
        out.contains("\u{1b}]133;"),
        "интеграция обязана слать OSC 133, вывод: {out:?}"
    );
}
