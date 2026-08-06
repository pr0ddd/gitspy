use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc::{channel, Receiver};

pub const PORT: u16 = 53682;

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
    let listener = TcpListener::bind(("127.0.0.1", PORT))?;
    let (say, seen) = channel();

    std::thread::spawn(move || {
        for stream in listener.incoming() {
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
