use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const PORT: u16 = 53682;

static ACTIVE: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

fn abandon_the_previous_listener() {
    let Ok(mut active) = ACTIVE.lock() else {
        return;
    };
    if let Some(cancelled) = active.take() {
        cancelled.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(("127.0.0.1", PORT));
    }
}

fn bind_with_patience() -> std::io::Result<TcpListener> {
    let mut last = None;
    for _ in 0..20 {
        match TcpListener::bind(("127.0.0.1", PORT)) {
            Ok(listener) => return Ok(listener),
            Err(e) => {
                last = Some(e);
                std::thread::sleep(Duration::from_millis(25));
            }
        }
    }
    Err(last.expect("после неудачных попыток остаётся последняя ошибка"))
}

const DONE_PAGE: &str = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n<html><body style=\"font-family:system-ui;background:#111;color:#ddd;display:flex;align-items:center;justify-content:center;height:100vh\"><p>gitspy is connected - you can close this tab.</p></body></html>";

fn decoded(raw: &str) -> String {
    let mut out = Vec::new();
    let mut bytes = raw.bytes();
    while let Some(b) = bytes.next() {
        match b {
            b'%' => {
                let hi = bytes.next();
                let lo = bytes.next();
                match (hi, lo) {
                    (Some(hi), Some(lo)) => {
                        let pair = [hi, lo];
                        match u8::from_str_radix(&String::from_utf8_lossy(&pair), 16) {
                            Ok(byte) => out.push(byte),
                            Err(_) => out.extend_from_slice(&[b'%', hi, lo]),
                        }
                    }
                    _ => out.push(b'%'),
                }
            }
            b'+' => out.push(b' '),
            other => out.push(other),
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

pub fn parse_callback(request_line: &str) -> Option<(String, String)> {
    let path = request_line.split_whitespace().nth(1)?;
    let query = path.strip_prefix("/callback?")?;
    let mut code = None;
    let mut state = None;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=')?;
        match key {
            "code" => code = Some(decoded(value)),
            "state" => state = Some(decoded(value)),
            _ => {}
        }
    }
    Some((code?, state?))
}

pub fn listen_once(expected_state: String) -> std::io::Result<Receiver<String>> {
    abandon_the_previous_listener();
    let listener = bind_with_patience()?;
    let (say, seen) = channel();

    let cancelled = Arc::new(AtomicBool::new(false));
    if let Ok(mut active) = ACTIVE.lock() {
        *active = Some(cancelled.clone());
    }

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if cancelled.load(Ordering::SeqCst) {
                return;
            }
            let Ok(mut stream) = stream else { continue };
            let mut raw = [0u8; 4096];
            let Ok(read) = stream.read(&mut raw) else {
                continue;
            };
            let text = String::from_utf8_lossy(&raw[..read]);
            let Some(first_line) = text.lines().next() else {
                continue;
            };
            if let Some((code, state)) = parse_callback(first_line) {
                if state == expected_state {
                    let _ = stream.write_all(DONE_PAGE.as_bytes());
                    let _ = say.send(code);
                    return;
                }
            }
            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        }
    });

    Ok(seen)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_sign_in_replaces_the_stale_listener_instead_of_dying_on_the_port() {
        let _stale = listen_once("gone".into()).expect("первый слушатель поднимается");
        let fresh =
            listen_once("wanted".into()).expect("брошенный вход не должен навсегда занимать порт");

        let mut stream = TcpStream::connect(("127.0.0.1", PORT)).expect("порт слушается");
        stream
            .write_all(b"GET /callback?code=c0de&state=wanted HTTP/1.1\r\n\r\n")
            .expect("запрос уходит");
        let code = fresh
            .recv_timeout(Duration::from_secs(2))
            .expect("код доходит до нового слушателя");
        assert_eq!(code, "c0de");
    }

    #[test]
    fn the_callback_line_yields_code_and_state() {
        assert_eq!(
            parse_callback("GET /callback?code=abc%2F1&state=st+x HTTP/1.1"),
            Some(("abc/1".to_string(), "st x".to_string())),
            "percent- и plus-кодирование обязаны разворачиваться"
        );
    }

    #[test]
    fn foreign_paths_and_missing_pieces_are_refused() {
        assert_eq!(parse_callback("GET /favicon.ico HTTP/1.1"), None);
        assert_eq!(parse_callback("GET /callback?state=only HTTP/1.1"), None);
        assert_eq!(parse_callback("GET /callback?code=only HTTP/1.1"), None);
    }
}
