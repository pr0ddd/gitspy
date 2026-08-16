use crate::term_batch::Batcher;
use crate::views::{state_lock_failed, ErrorView};
use gitspy_term::{OnBytes, PtySession, SpawnSpec};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::ipc::{Channel, InvokeResponseBody};

const FRAME_BYTES: usize = 32768;
const FRAME_WAIT: Duration = Duration::from_millis(8);
const UNACKED_LIMIT: usize = 1_048_576;
const READER_PAUSE: Duration = Duration::from_millis(5);
const OPEN_COLS: u16 = 80;
const OPEN_ROWS: u16 = 24;

struct Pending {
    batcher: Batcher,
    holds_bytes: bool,
    live: bool,
}

struct Pump {
    pending: Mutex<Pending>,
    deadline: Condvar,
    unacked: AtomicUsize,
}

impl Pump {
    fn new() -> Pump {
        Pump {
            pending: Mutex::new(Pending {
                batcher: Batcher::new(FRAME_BYTES, FRAME_WAIT),
                holds_bytes: false,
                live: true,
            }),
            deadline: Condvar::new(),
            unacked: AtomicUsize::new(0),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Pending> {
        self.pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn live(&self) -> bool {
        self.lock().live
    }

    fn stop(&self) {
        self.lock().live = false;
        self.deadline.notify_all();
    }

    fn drop_ack(&self, bytes: usize) {
        let _ = self
            .unacked
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |left| {
                Some(left.saturating_sub(bytes))
            });
    }
}

struct Session {
    pty: PtySession,
    pump: Arc<Pump>,
}

static NEXT_ID: AtomicU32 = AtomicU32::new(1);
static SESSIONS: Mutex<Option<HashMap<u32, Session>>> = Mutex::new(None);

fn sessions() -> Result<MutexGuard<'static, Option<HashMap<u32, Session>>>, ErrorView> {
    SESSIONS.lock().map_err(|_| state_lock_failed())
}

fn session_gone() -> ErrorView {
    ErrorView::new("term.gone")
}

fn with_session<T>(
    id: u32,
    act: impl FnOnce(&mut Session) -> Result<T, String>,
) -> Result<T, ErrorView> {
    let mut lock = sessions()?;
    let session = lock
        .as_mut()
        .and_then(|open| open.get_mut(&id))
        .ok_or_else(session_gone)?;
    act(session).map_err(|detail| session_gone().detail(detail))
}

fn send_frame_awaiting_ack(
    pump: &Pump,
    sink: &Channel<InvokeResponseBody>,
    frame: Vec<u8>,
) -> bool {
    let size = frame.len();
    if sink.send(InvokeResponseBody::Raw(frame)).is_err() {
        return false;
    }
    pump.unacked.fetch_add(size, Ordering::SeqCst);
    true
}

fn pause_reader_until_frontend_catches_up(pump: &Pump) {
    while pump.unacked.load(Ordering::SeqCst) > UNACKED_LIMIT && pump.live() {
        std::thread::sleep(READER_PAUSE);
    }
}

fn batch_bytes_into_frames(pump: Arc<Pump>, sink: Channel<InvokeResponseBody>) -> OnBytes {
    Box::new(move |bytes| {
        {
            let mut pending = pump.lock();
            match pending.batcher.push(bytes, Instant::now()) {
                Some(frame) => {
                    pending.holds_bytes = false;
                    if !send_frame_awaiting_ack(&pump, &sink, frame) {
                        pending.live = false;
                        pump.deadline.notify_all();
                        return;
                    }
                }
                None => {
                    pending.holds_bytes = true;
                    pump.deadline.notify_all();
                }
            }
        }
        pause_reader_until_frontend_catches_up(&pump);
    })
}

fn flush_frames_the_reader_left_behind(pump: &Pump, sink: &Channel<InvokeResponseBody>) {
    loop {
        {
            let mut pending = pump.lock();
            while pending.live && !pending.holds_bytes {
                pending = pump
                    .deadline
                    .wait(pending)
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
            }
            if !pending.live {
                return;
            }
        }
        std::thread::sleep(FRAME_WAIT);
        let mut pending = pump.lock();
        if !pending.live {
            return;
        }
        pending.holds_bytes = false;
        if let Some(frame) = pending.batcher.flush() {
            if !send_frame_awaiting_ack(pump, sink, frame) {
                pending.live = false;
                pump.deadline.notify_all();
                return;
            }
        }
    }
}

#[tauri::command]
pub fn term_open(
    cwd: String,
    command: Option<String>,
    on_data: Channel<InvokeResponseBody>,
) -> Result<u32, ErrorView> {
    let pump = Arc::new(Pump::new());
    let flushing = Arc::clone(&pump);
    let flush_sink = on_data.clone();
    std::thread::spawn(move || flush_frames_the_reader_left_behind(&flushing, &flush_sink));
    let spec = SpawnSpec {
        command,
        cwd: PathBuf::from(cwd),
        cols: OPEN_COLS,
        rows: OPEN_ROWS,
    };
    let mut pty = match PtySession::spawn(spec, batch_bytes_into_frames(Arc::clone(&pump), on_data))
    {
        Ok(pty) => pty,
        Err(detail) => {
            pump.stop();
            return Err(ErrorView::new("term.spawn").detail(detail));
        }
    };
    let mut lock = match sessions() {
        Ok(lock) => lock,
        Err(error) => {
            pty.kill();
            pump.stop();
            return Err(error);
        }
    };
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    lock.get_or_insert_with(HashMap::new)
        .insert(id, Session { pty, pump });
    Ok(id)
}

#[tauri::command]
pub fn term_input(id: u32, data: String) -> Result<(), ErrorView> {
    with_session(id, |session| session.pty.write(data.as_bytes()))
}

#[tauri::command]
pub fn term_resize(id: u32, cols: u16, rows: u16) -> Result<(), ErrorView> {
    with_session(id, |session| session.pty.resize(cols, rows))
}

#[tauri::command]
pub fn term_ack(id: u32, bytes: usize) -> Result<(), ErrorView> {
    with_session(id, |session| {
        session.pump.drop_ack(bytes);
        Ok(())
    })
}

#[tauri::command]
pub fn term_kill(id: u32) -> Result<(), ErrorView> {
    let mut session = sessions()?
        .as_mut()
        .and_then(|open| open.remove(&id))
        .ok_or_else(session_gone)?;
    session.pty.kill();
    session.pump.stop();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn channel_collecting_bytes() -> (Channel<InvokeResponseBody>, Arc<Mutex<Vec<u8>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&seen);
        let channel = Channel::new(move |body| {
            if let InvokeResponseBody::Raw(bytes) = body {
                sink.lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .extend_from_slice(&bytes);
            }
            Ok(())
        });
        (channel, seen)
    }

    fn chunk_of(step: u8) -> Vec<u8> {
        let size = 1 + (usize::from(step) * 977) % 9000;
        vec![step; size]
    }

    #[test]
    fn reader_and_deadline_frames_keep_the_pty_byte_order() {
        let pump = Arc::new(Pump::new());
        let (channel, seen) = channel_collecting_bytes();
        let flushing = Arc::clone(&pump);
        let deadline_channel = channel.clone();
        let flusher = std::thread::spawn(move || {
            flush_frames_the_reader_left_behind(&flushing, &deadline_channel);
        });

        let mut push = batch_bytes_into_frames(Arc::clone(&pump), channel);
        let mut produced = Vec::new();
        for step in 0..48u8 {
            let chunk = chunk_of(step);
            produced.extend_from_slice(&chunk);
            push(&chunk);
            if step % 3 == 0 {
                std::thread::sleep(FRAME_WAIT * 2);
            }
        }
        std::thread::sleep(FRAME_WAIT * 6);
        pump.stop();
        flusher.join().expect("the flusher thread finishes");

        let delivered = seen
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        assert_eq!(
            delivered.len(),
            produced.len(),
            "not a single output byte is lost between the reader and the flusher"
        );
        assert_eq!(
            delivered, produced,
            "the frames of the two threads join back into the same byte stream the PTY produced"
        );
    }

    #[test]
    fn acknowledged_bytes_release_the_reader() {
        let pump = Pump::new();
        pump.unacked.store(UNACKED_LIMIT * 2, Ordering::SeqCst);
        pump.drop_ack(UNACKED_LIMIT * 2);
        assert_eq!(
            pump.unacked.load(Ordering::SeqCst),
            0,
            "an acknowledgement from the frontend clears the unacknowledged counter"
        );
        pump.drop_ack(4096);
        assert_eq!(
            pump.unacked.load(Ordering::SeqCst),
            0,
            "an extra acknowledgement does not take the counter below zero"
        );
    }
}
