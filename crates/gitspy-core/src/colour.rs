/// Индекс цвета в палитре. Конкретные значения цветов принадлежат renderer'у.
pub type ColourIdx = u8;

/// Размер палитры. Больше — реже совпадения соседних линий, но труднее различать оттенки.
pub const PALETTE_LEN: u8 = 12;

/// Выдаёт цвета линиям графа.
///
/// Курсор двигается только вперёд, поэтому освободившийся цвет не достаётся
/// следующей же линии — иначе две соседние по времени ветки выглядели бы одинаково.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ColourAllocator {
    cursor: u32,
}

impl ColourAllocator {
    pub fn new() -> Self {
        Self { cursor: 0 }
    }

    pub fn from_cursor(cursor: u32) -> Self {
        Self { cursor }
    }

    pub fn cursor(&self) -> u32 {
        self.cursor
    }

    /// Выдаёт цвет, не занятый ни одной живой линией.
    ///
    /// Если занята вся палитра, возвращает позицию курсора: коллизия неизбежна,
    /// но выбор остаётся детерминированным.
    pub fn next(&mut self, live: &[ColourIdx]) -> ColourIdx {
        let palette = PALETTE_LEN as u32;
        for offset in 0..palette {
            let candidate = ((self.cursor + offset) % palette) as ColourIdx;
            if !live.contains(&candidate) {
                self.cursor = self.cursor.wrapping_add(offset + 1);
                return candidate;
            }
        }
        let candidate = (self.cursor % palette) as ColourIdx;
        self.cursor = self.cursor.wrapping_add(1);
        candidate
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_at_zero() {
        let mut a = ColourAllocator::new();
        assert_eq!(a.next(&[]), 0);
    }

    #[test]
    fn advances_monotonically() {
        let mut a = ColourAllocator::new();
        assert_eq!(a.next(&[]), 0);
        assert_eq!(a.next(&[0]), 1);
        assert_eq!(a.next(&[0, 1]), 2);
    }

    #[test]
    fn does_not_reuse_a_freed_colour_immediately() {
        // Это регрессия на дефект старого движка: линия умерла, цвет освободился,
        // следующая линия получала тот же цвет и две ветки сливались визуально.
        let mut a = ColourAllocator::new();
        let first = a.next(&[]);
        assert_eq!(first, 0);
        // линия с цветом 0 умерла — живых линий нет
        let second = a.next(&[]);
        assert_ne!(second, first);
        assert_eq!(second, 1);
    }

    #[test]
    fn skips_colours_currently_in_use() {
        let mut a = ColourAllocator::from_cursor(3);
        // цвета 3 и 4 заняты живыми линиями
        assert_eq!(a.next(&[3, 4]), 5);
    }

    #[test]
    fn wraps_after_the_full_palette() {
        let mut a = ColourAllocator::from_cursor(PALETTE_LEN as u32 - 1);
        assert_eq!(a.next(&[]), PALETTE_LEN - 1);
        assert_eq!(a.next(&[]), 0);
    }

    #[test]
    fn falls_back_when_every_colour_is_live() {
        let live: Vec<ColourIdx> = (0..PALETTE_LEN).collect();
        let mut a = ColourAllocator::from_cursor(5);
        // все цвета заняты — берём позицию курсора, коллизия неизбежна
        assert_eq!(a.next(&live), 5);
        assert_eq!(a.cursor(), 6);
    }

    #[test]
    fn cursor_round_trips_through_from_cursor() {
        let mut a = ColourAllocator::new();
        a.next(&[]);
        a.next(&[0]);
        let restored = ColourAllocator::from_cursor(a.cursor());
        assert_eq!(restored, a);
    }
}
