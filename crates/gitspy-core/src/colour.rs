use crate::layout::LaneIdx;

pub type ColourIdx = u8;

pub const PALETTE_LEN: u8 = 12;

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
        for _ in 0..100 {
            assert_eq!(colour_of_lane(0), 0);
        }
    }
}
