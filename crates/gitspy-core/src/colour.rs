use crate::layout::LaneIdx;

/// Индекс цвета в палитре. Конкретные значения цветов принадлежат renderer'у.
pub type ColourIdx = u8;

/// Размер палитры.
pub const PALETTE_LEN: u8 = 12;

/// Цвет определяется НОМЕРОМ КОЛОНКИ, а не линией, которая её занимает.
///
/// Так делает GitKraken, и это принципиально: колонка 0 всегда одного цвета
/// на всю историю. При привязке цвета к линии он менялся бы каждый раз, когда
/// линия в колонке умирает и её место занимает следующая — магистраль на
/// середине истории вдруг меняла бы цвет без всякой причины.
///
/// Плата: две ветки, жившие в одной колонке в разное время, неотличимы по
/// цвету. Это приемлемо, потому что колонки стабильны.
pub const fn colour_of_lane(lane: LaneIdx) -> ColourIdx {
    (lane % PALETTE_LEN as LaneIdx) as ColourIdx
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colour_follows_the_lane() {
        assert_eq!(colour_of_lane(0), 0);
        assert_eq!(colour_of_lane(1), 1);
        assert_eq!(colour_of_lane(5), 5);
    }

    #[test]
    fn wraps_after_the_palette() {
        assert_eq!(colour_of_lane(PALETTE_LEN as LaneIdx), 0);
        assert_eq!(colour_of_lane(PALETTE_LEN as LaneIdx + 3), 3);
    }

    #[test]
    fn a_lane_keeps_its_colour_forever() {
        // Свойство, ради которого всё и затевалось: сколько бы линий ни сменилось
        // в колонке, её цвет не меняется.
        for _ in 0..100 {
            assert_eq!(colour_of_lane(0), 0);
        }
    }
}
