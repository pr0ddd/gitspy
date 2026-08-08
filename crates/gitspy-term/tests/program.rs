use gitspy_term::{ProgramExit, ProgramSpec, PtyProgram};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

fn run(command: &str, args: &[&str], cwd: PathBuf, env: &[(&str, &str)]) -> (String, ProgramExit) {
    let (bytes_tx, bytes_rx) = mpsc::channel::<Vec<u8>>();
    let (exit_tx, exit_rx) = mpsc::channel::<ProgramExit>();
    let mut program = PtyProgram::start(
        ProgramSpec {
            command: command.to_owned(),
            args: args.iter().map(|a| (*a).to_owned()).collect(),
            cwd,
            env: env
                .iter()
                .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
                .collect(),
            cols: 80,
            rows: 24,
        },
        Box::new(move |bytes| {
            let _ = bytes_tx.send(bytes.to_vec());
        }),
        Box::new(move |exit| {
            let _ = exit_tx.send(exit);
        }),
    )
    .expect("программа должна запускаться");
    let exit = exit_rx
        .recv_timeout(Duration::from_secs(10))
        .expect("выход обязан прийти");
    let mut out = Vec::new();
    while let Ok(chunk) = bytes_rx.try_recv() {
        out.extend(chunk);
    }
    program.kill();
    (String::from_utf8_lossy(&out).into_owned(), exit)
}

#[test]
fn arguments_reach_the_program_untouched_by_a_shell() {
    let dir = tempfile::tempdir().expect("временный каталог");
    std::fs::write(dir.path().join("marker.txt"), "x").expect("файл пишется");
    let (out, _) = run(
        "/bin/echo",
        &["раз два", "*"],
        dir.path().to_path_buf(),
        &[],
    );
    assert!(
        out.contains("раз два *"),
        "аргумент с пробелом и звёздочка обязаны дойти как есть, вывод: {out:?}"
    );
    assert!(
        !out.contains("marker.txt"),
        "звёздочка развернулась в имена файлов — команду прогнали через шелл, вывод: {out:?}"
    );
}

#[test]
fn the_program_starts_in_the_asked_directory_with_the_asked_environment() {
    let dir = tempfile::tempdir().expect("временный каталог");
    let (out, _) = run(
        "/usr/bin/env",
        &[],
        dir.path().to_path_buf(),
        &[("GITSPY_MARK", "один")],
    );
    assert!(
        out.contains("GITSPY_MARK=один"),
        "переменные, объявленные агентом, обязаны дойти до команды, вывод: {out:?}"
    );
    let (pwd, _) = run("/bin/pwd", &[], dir.path().to_path_buf(), &[]);
    let asked = dir
        .path()
        .canonicalize()
        .expect("каталог канонизируется")
        .to_string_lossy()
        .into_owned();
    assert!(
        pwd.contains(&asked),
        "команда агента идёт из корня репозитория, а не откуда попало, вывод: {pwd:?}"
    );
}

#[test]
fn the_exit_code_of_the_program_is_reported_after_its_last_byte() {
    let (out, exit) = run(
        "/bin/sh",
        &["-c", "echo ГОТОВО; exit 3"],
        PathBuf::from("/tmp"),
        &[],
    );
    assert!(
        out.contains("ГОТОВО"),
        "весь вывод обязан быть собран до сообщения о выходе, вывод: {out:?}"
    );
    assert_eq!(
        exit,
        ProgramExit {
            code: Some(3),
            signal: None
        },
        "агент решает по коду выхода, получилось ли у него"
    );
}

#[test]
fn a_killed_program_reports_the_signal_instead_of_a_code() {
    let (bytes_tx, _bytes_rx) = mpsc::channel::<Vec<u8>>();
    let (exit_tx, exit_rx) = mpsc::channel::<ProgramExit>();
    let mut program = PtyProgram::start(
        ProgramSpec {
            command: "/bin/sleep".to_owned(),
            args: vec!["30".to_owned()],
            cwd: PathBuf::from("/tmp"),
            env: Vec::new(),
            cols: 80,
            rows: 24,
        },
        Box::new(move |bytes| {
            let _ = bytes_tx.send(bytes.to_vec());
        }),
        Box::new(move |exit| {
            let _ = exit_tx.send(exit);
        }),
    )
    .expect("программа должна запускаться");
    program.kill();
    let exit = exit_rx
        .recv_timeout(Duration::from_secs(10))
        .expect("убитая команда обязана отчитаться, иначе агент ждёт её вечно");
    assert_eq!(
        exit.code, None,
        "убитая сигналом команда кода выхода не имеет, и выдумывать его нельзя"
    );
    assert!(
        exit.signal.is_some(),
        "по чему именно оборвалась команда — единственное, что о ней осталось известно"
    );
}
