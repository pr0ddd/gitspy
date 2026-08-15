use gitspy_term::{PtySession, SpawnSpec};
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
    .expect("the session must spawn");
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
        cwd: std::env::temp_dir(),
        cols: 80,
        rows: 24,
    });
    assert!(
        out.contains("MARK_TTY"),
        "the shell must get a real TTY, output: {out}"
    );
}

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
