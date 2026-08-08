use crate::acp::{AcpEventView, EventSink};
use gitspy_acp::{TerminalBridge, TerminalExit, TerminalOutput};
use gitspy_term::{ProgramSpec, PtyProgram};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};

const DEFAULT_OUTPUT_LIMIT: usize = 1_048_576;
const PANEL_COLS: u16 = 120;
const PANEL_ROWS: u16 = 30;

static NEXT_TERMINAL: AtomicU32 = AtomicU32::new(1);

fn lock_through_poison<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn limit_of(declared: Option<u64>) -> usize {
    declared
        .and_then(|bytes| usize::try_from(bytes).ok())
        .unwrap_or(DEFAULT_OUTPUT_LIMIT)
}

fn terminal_gone(id: &str) -> String {
    format!("terminal gone: {id}")
}

struct Captured {
    bytes: Vec<u8>,
    limit: usize,
    truncated: bool,
}

impl Captured {
    fn new(limit: usize) -> Captured {
        Captured {
            bytes: Vec::new(),
            limit,
            truncated: false,
        }
    }

    fn push(&mut self, chunk: &[u8]) {
        self.bytes.extend_from_slice(chunk);
        if self.bytes.len() > self.limit {
            let over = self.bytes.len() - self.limit;
            self.bytes.drain(..over);
            self.truncated = true;
        }
    }

    fn text(&self) -> String {
        String::from_utf8_lossy(&self.bytes).into_owned()
    }
}

struct Finished {
    exit: Mutex<Option<TerminalExit>>,
    settled: Condvar,
}

impl Finished {
    fn new() -> Finished {
        Finished {
            exit: Mutex::new(None),
            settled: Condvar::new(),
        }
    }

    fn settle(&self, exit: TerminalExit) {
        *lock_through_poison(&self.exit) = Some(exit);
        self.settled.notify_all();
    }

    fn seen(&self) -> Option<TerminalExit> {
        lock_through_poison(&self.exit).clone()
    }

    fn awaited(&self) -> TerminalExit {
        let mut settled = lock_through_poison(&self.exit);
        while settled.is_none() {
            settled = self
                .settled
                .wait(settled)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
        }
        settled
            .clone()
            .expect("ожидание кончается только с известным выходом")
    }
}

struct LiveTerminal {
    program: PtyProgram,
    captured: Arc<Mutex<Captured>>,
    finished: Arc<Finished>,
}

pub struct BorderTerminals {
    repo: PathBuf,
    sink: Arc<dyn EventSink>,
    live: HashMap<String, LiveTerminal>,
}

impl BorderTerminals {
    pub fn new(repo: PathBuf, sink: Arc<dyn EventSink>) -> BorderTerminals {
        BorderTerminals {
            repo,
            sink,
            live: HashMap::new(),
        }
    }

    fn living(&self, id: &str) -> Result<&LiveTerminal, String> {
        self.live.get(id).ok_or_else(|| terminal_gone(id))
    }
}

impl TerminalBridge for BorderTerminals {
    fn create(
        &mut self,
        command: &str,
        args: &[String],
        cwd: Option<&str>,
        env: &[(String, String)],
        limit: Option<u64>,
    ) -> Result<String, String> {
        let id = format!("term_{}", NEXT_TERMINAL.fetch_add(1, Ordering::SeqCst));
        let captured = Arc::new(Mutex::new(Captured::new(limit_of(limit))));
        let finished = Arc::new(Finished::new());
        let filling = Arc::clone(&captured);
        let streaming = Arc::clone(&self.sink);
        let streamed_id = id.clone();
        let ending = Arc::clone(&finished);
        let ended_sink = Arc::clone(&self.sink);
        let ended_id = id.clone();
        let program = PtyProgram::start(
            ProgramSpec {
                command: command.to_owned(),
                args: args.to_vec(),
                cwd: cwd.map(PathBuf::from).unwrap_or_else(|| self.repo.clone()),
                env: env.to_vec(),
                cols: PANEL_COLS,
                rows: PANEL_ROWS,
            },
            Box::new(move |bytes| {
                lock_through_poison(&filling).push(bytes);
                streaming.emit(AcpEventView::TerminalOutput {
                    terminal_id: streamed_id.clone(),
                    bytes: bytes.to_vec(),
                });
            }),
            Box::new(move |exit| {
                ended_sink.emit(AcpEventView::TerminalExit {
                    terminal_id: ended_id,
                    code: exit.code,
                    signal: exit.signal.clone(),
                });
                ending.settle(TerminalExit {
                    code: exit.code,
                    signal: exit.signal,
                });
            }),
        )?;
        self.live.insert(
            id.clone(),
            LiveTerminal {
                program,
                captured,
                finished,
            },
        );
        Ok(id)
    }

    fn output(&mut self, id: &str) -> Result<TerminalOutput, String> {
        let live = self.living(id)?;
        let captured = lock_through_poison(&live.captured);
        Ok(TerminalOutput {
            output: captured.text(),
            truncated: captured.truncated,
            exit: live.finished.seen(),
        })
    }

    fn wait(&mut self, id: &str) -> Result<TerminalExit, String> {
        Ok(self.living(id)?.finished.awaited())
    }

    fn kill(&mut self, id: &str) -> Result<(), String> {
        self.live
            .get_mut(id)
            .ok_or_else(|| terminal_gone(id))?
            .program
            .kill();
        Ok(())
    }

    fn release(&mut self, id: &str) -> Result<(), String> {
        let mut released = self.live.remove(id).ok_or_else(|| terminal_gone(id))?;
        released.program.kill();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gitspy_acp::TerminalBridge;
    use std::sync::{Arc, Mutex};

    struct Collected(Arc<Mutex<Vec<AcpEventView>>>);

    impl EventSink for Collected {
        fn emit(&self, event: AcpEventView) {
            self.0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(event);
        }
    }

    fn collecting() -> (Arc<dyn EventSink>, Arc<Mutex<Vec<AcpEventView>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        (Arc::new(Collected(Arc::clone(&seen))), seen)
    }

    fn streamed(seen: &Arc<Mutex<Vec<AcpEventView>>>, id: &str) -> String {
        let events = seen.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let bytes: Vec<u8> = events
            .iter()
            .filter_map(|event| match event {
                AcpEventView::TerminalOutput { terminal_id, bytes } if terminal_id == id => {
                    Some(bytes.clone())
                }
                _ => None,
            })
            .flatten()
            .collect();
        String::from_utf8_lossy(&bytes).into_owned()
    }

    fn reported_exit(seen: &Arc<Mutex<Vec<AcpEventView>>>, id: &str) -> Option<Option<i32>> {
        let events = seen.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        events.iter().find_map(|event| match event {
            AcpEventView::TerminalExit {
                terminal_id, code, ..
            } if terminal_id == id => Some(*code),
            _ => None,
        })
    }

    #[test]
    fn the_ring_buffer_keeps_the_tail_and_admits_it_dropped_the_head() {
        let mut captured = Captured::new(100);
        captured.push(&[b'a'; 60]);
        assert!(
            !captured.truncated,
            "пока лимит не пройден, обрезать нечего"
        );
        captured.push(&[b'b'; 60]);
        assert_eq!(
            captured.text().len(),
            100,
            "буфер держит ровно объявленный лимит"
        );
        assert!(
            captured.text().ends_with(&"b".repeat(60)),
            "хвост — это последнее, что напечатала команда, его и читает агент"
        );
        assert!(
            captured.truncated,
            "молча выбросив начало, мы дали бы агенту решить, что он видел всё"
        );
    }

    #[test]
    fn the_limit_the_agent_declared_wins_over_our_own() {
        assert_eq!(
            limit_of(Some(100)),
            100,
            "сколько вывода держать, решает агент"
        );
        assert_eq!(
            limit_of(None),
            DEFAULT_OUTPUT_LIMIT,
            "без объявления берём свой предел, а не бесконечность"
        );
    }

    #[test]
    fn a_command_of_the_agent_streams_its_bytes_and_reports_its_code() {
        let (sink, seen) = collecting();
        let mut terminals = BorderTerminals::new(PathBuf::from("/tmp"), sink);
        let id = terminals
            .create("/bin/echo", &["ГОТОВО".to_owned()], None, &[], None)
            .expect("терминал заводится");
        let exit = terminals.wait(&id).expect("команда обязана завершиться");
        assert_eq!(
            exit.code,
            Some(0),
            "код выхода доходит от процесса, а не выдумывается"
        );
        let captured = terminals.output(&id).expect("вывод читается");
        assert!(
            captured.output.contains("ГОТОВО"),
            "агент читает вывод своей команды, пришло: {:?}",
            captured.output
        );
        assert!(!captured.truncated, "короткий вывод не обрезается");
        assert_eq!(
            captured.exit,
            Some(exit),
            "output отдаёт и статус: по договору агент забирает оба одним вызовом"
        );
        assert!(
            streamed(&seen, &id).contains("ГОТОВО"),
            "панель кормится теми же байтами, что копятся для агента, пришло: {:?}",
            streamed(&seen, &id)
        );
        assert_eq!(
            reported_exit(&seen, &id),
            Some(Some(0)),
            "шапка карточки узнаёт о конце команды событием, а не опросом"
        );
        terminals.release(&id).expect("терминал отпускается");
    }

    #[test]
    fn a_command_without_a_directory_runs_in_the_repository_root() {
        let dir = tempfile::tempdir().expect("временный каталог");
        let (sink, _) = collecting();
        let mut terminals = BorderTerminals::new(dir.path().to_path_buf(), sink);
        let id = terminals
            .create("/bin/pwd", &[], None, &[], None)
            .expect("терминал заводится");
        terminals.wait(&id).expect("команда обязана завершиться");
        let root = dir
            .path()
            .canonicalize()
            .expect("каталог канонизируется")
            .to_string_lossy()
            .into_owned();
        let captured = terminals.output(&id).expect("вывод читается");
        assert!(
            captured.output.contains(&root),
            "команда агента идёт из корня репозитория сессии, пришло: {:?}",
            captured.output
        );
        terminals.release(&id).expect("терминал отпускается");
    }

    #[test]
    fn output_beyond_the_declared_limit_comes_back_marked_truncated() {
        let (sink, _) = collecting();
        let mut terminals = BorderTerminals::new(PathBuf::from("/tmp"), sink);
        let id = terminals
            .create(
                "/bin/sh",
                &["-c".to_owned(), "printf '%0500d' 0".to_owned()],
                None,
                &[],
                Some(100),
            )
            .expect("терминал заводится");
        terminals.wait(&id).expect("команда обязана завершиться");
        let captured = terminals.output(&id).expect("вывод читается");
        assert!(
            captured.truncated,
            "агент обязан знать, что видит не весь вывод"
        );
        assert!(
            captured.output.len() <= 100,
            "буфер не растёт за объявленный лимит, пришло байт: {}",
            captured.output.len()
        );
        terminals.release(&id).expect("терминал отпускается");
    }

    #[test]
    fn a_released_terminal_is_forgotten_and_asking_about_it_fails() {
        let (sink, _) = collecting();
        let mut terminals = BorderTerminals::new(PathBuf::from("/tmp"), sink);
        let id = terminals
            .create("/bin/echo", &["раз".to_owned()], None, &[], None)
            .expect("терминал заводится");
        terminals.wait(&id).expect("команда обязана завершиться");
        terminals.release(&id).expect("терминал отпускается");
        assert!(
            terminals.output(&id).is_err(),
            "отпущенный терминал держал бы процесс и буфер до конца сессии"
        );
    }
}
