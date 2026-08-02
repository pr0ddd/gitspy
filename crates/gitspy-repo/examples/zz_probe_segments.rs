//! Временный пробник аудита: сколько сегментов и сколько байт JSON.
use gitspy_core::chunk;
use gitspy_core::layout::Segment;
use std::time::Instant;

fn json_len_u64(values: impl Iterator<Item = u64>) -> usize {
    // "[a,b,c]" — длина = 2 скобки + цифры + запятые
    let mut n = 0usize;
    let mut count = 0usize;
    for v in values {
        n += v.to_string().len();
        count += 1;
    }
    2 + n + count.saturating_sub(1)
}

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| ".".into());
    let t = Instant::now();
    let history = gitspy_repo::read(std::path::Path::new(&path), None).expect("read");
    let read_ms = t.elapsed().as_secs_f64() * 1000.0;
    let t = Instant::now();
    let layout = chunk::layout(&history.topology);
    let layout_ms = t.elapsed().as_secs_f64() * 1000.0;

    let rows = layout.len();
    let segs: usize = layout.segments.iter().map(|s| s.len()).sum();
    println!(
        "путь {path}: строк {rows}, max_lane {}, сегментов {segs}, ср. {:.1} на строку; чтение {read_ms:.0} мс, раскладка {layout_ms:.1} мс",
        layout.max_lane,
        segs as f64 / rows.max(1) as f64
    );

    // Плоские массивы ровно как в build_layout_view.
    let mut seg_kind: Vec<u8> = Vec::new();
    let mut seg_from: Vec<u16> = Vec::new();
    let mut seg_to: Vec<u16> = Vec::new();
    let mut seg_colour: Vec<u8> = Vec::new();
    let mut seg_offsets: Vec<u32> = vec![0];
    for segments in &layout.segments {
        for s in segments {
            match s {
                Segment::Through { lane, colour } => {
                    seg_kind.push(0);
                    seg_from.push(*lane);
                    seg_to.push(*lane);
                    seg_colour.push(*colour);
                }
                Segment::Branch { from, to, colour } => {
                    seg_kind.push(1);
                    seg_from.push(*from);
                    seg_to.push(*to);
                    seg_colour.push(*colour);
                }
                Segment::Merge { from, to, colour } => {
                    seg_kind.push(2);
                    seg_from.push(*from);
                    seg_to.push(*to);
                    seg_colour.push(*colour);
                }
            }
        }
        seg_offsets.push(seg_kind.len() as u32);
    }

    let lanes: Vec<u16> = layout.rows.iter().map(|r| r.lane).collect();
    let colours: Vec<u8> = layout.rows.iter().map(|r| r.colour).collect();

    let b_lanes = json_len_u64(lanes.iter().map(|v| *v as u64));
    let b_colours = json_len_u64(colours.iter().map(|v| *v as u64));
    let b_kinds = json_len_u64(layout.rows.iter().map(|_| 0u64));
    let b_off = json_len_u64(seg_offsets.iter().map(|v| *v as u64));
    let b_k = json_len_u64(seg_kind.iter().map(|v| *v as u64));
    let b_f = json_len_u64(seg_from.iter().map(|v| *v as u64));
    let b_t = json_len_u64(seg_to.iter().map(|v| *v as u64));
    let b_c = json_len_u64(seg_colour.iter().map(|v| *v as u64));
    let total = b_lanes + b_colours + b_kinds + b_off + b_k + b_f + b_t + b_c;
    let mib = |b: usize| b as f64 / 1048576.0;
    println!(
        "JSON числовых массивов: lanes {:.2} + colours {:.2} + kinds {:.2} + offsets {:.2} + seg_kind {:.2} + seg_from {:.2} + seg_to {:.2} + seg_colour {:.2} = {:.2} МиБ",
        mib(b_lanes), mib(b_colours), mib(b_kinds), mib(b_off), mib(b_k), mib(b_f), mib(b_t), mib(b_c), mib(total)
    );

    let meta_bytes: usize = history
        .commits
        .iter()
        .map(|c| c.hash.len() + c.author.len() + c.email.len() + c.subject.len() + c.body.len() + 8)
        .sum();
    println!("метаданные (сырой текст): {:.2} МиБ на {} коммитов", mib(meta_bytes), history.commits.len());

    // Сколько сегментов у видимого окна ~45 строк в середине.
    let first = rows / 2;
    let win: usize = layout.segments[first..(first + 45).min(rows)].iter().map(|s| s.len()).sum();
    println!("сегментов в окне 45 строк с середины: {win}");

    // Гистограмма дорожек > 31 (для минимапы).
    let over = lanes.iter().filter(|l| **l >= 32).count();
    println!("коммитов на дорожках >= 32: {over}");

    // Сколько fillRect делает drawMinimap при разной высоте окна.
    for height in [700usize, 1000, 1400] {
        let buckets = height.max(1);
        let mut bits = vec![0u32; buckets];
        for (i, lane) in lanes.iter().enumerate() {
            let l = (*lane).min(31) as u32;
            let b = ((i * buckets) / rows).min(buckets - 1);
            bits[b] |= 1 << l;
        }
        let fills: u32 = bits.iter().map(|m| m.count_ones()).sum();
        println!("минимапа height={height}: {fills} fillRect на кадр");
    }
}
