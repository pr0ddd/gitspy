use std::time::{Duration, Instant};

pub struct Batcher {
    buf: Vec<u8>,
    first_at: Option<Instant>,
    max_bytes: usize,
    max_wait: Duration,
}

impl Batcher {
    pub fn new(max_bytes: usize, max_wait: Duration) -> Batcher {
        Batcher {
            buf: Vec::new(),
            first_at: None,
            max_bytes,
            max_wait,
        }
    }

    pub fn push(&mut self, bytes: &[u8], now: Instant) -> Option<Vec<u8>> {
        if self.buf.is_empty() {
            self.first_at = Some(now);
        }
        self.buf.extend_from_slice(bytes);
        let due = self
            .first_at
            .is_some_and(|t| now.duration_since(t) >= self.max_wait);
        if self.buf.len() >= self.max_bytes || due {
            return self.flush();
        }
        None
    }

    pub fn flush(&mut self) -> Option<Vec<u8>> {
        if self.buf.is_empty() {
            return None;
        }
        self.first_at = None;
        Some(std::mem::take(&mut self.buf))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn small_chunks_wait_for_deadline() {
        let mut b = Batcher::new(32768, Duration::from_millis(8));
        let t0 = Instant::now();
        assert!(
            b.push(b"ab", t0).is_none(),
            "a small chunk is not sent right away"
        );
        let sent = b.push(b"cd", t0 + Duration::from_millis(9));
        assert_eq!(
            sent.as_deref(),
            Some(&b"abcd"[..]),
            "everything collected is sent once the deadline passes"
        );
    }

    #[test]
    fn big_chunk_flushes_immediately() {
        let mut b = Batcher::new(8, Duration::from_millis(8));
        let sent = b.push(b"0123456789", Instant::now());
        assert_eq!(
            sent.as_deref(),
            Some(&b"0123456789"[..]),
            "an overflowing chunk is sent immediately"
        );
    }

    #[test]
    fn flush_drains_leftovers() {
        let mut b = Batcher::new(32768, Duration::from_millis(8));
        let _ = b.push(b"xy", Instant::now());
        assert_eq!(
            b.flush().as_deref(),
            Some(&b"xy"[..]),
            "flush hands over the leftovers"
        );
        assert!(b.flush().is_none(), "the second flush is empty");
    }
}
