use crate::layout::{Layout, NodeKind, Segment};
use std::fmt::Write as _;

fn kind_name(kind: NodeKind) -> &'static str {
    match kind {
        NodeKind::Normal => "Normal",
        NodeKind::Merge => "Merge",
        NodeKind::Root => "Root",
        NodeKind::Open => "Open",
    }
}

fn segment_text(segment: &Segment) -> String {
    match segment {
        Segment::Through { lane, colour } => format!("through {lane} c{colour}"),
        Segment::Merge { from, to, colour } => format!("merge {from}>{to} c{colour}"),
        Segment::Branch { from, to, colour } => format!("branch {from}>{to} c{colour}"),
        Segment::StemUp { lane, colour } => format!("stem-up {lane} c{colour}"),
        Segment::StemDown { lane, colour } => format!("stem-down {lane} c{colour}"),
    }
}

pub fn render(layout: &Layout, names: &[String]) -> String {
    let mut out = String::new();
    for (i, row) in layout.rows.iter().enumerate() {
        let name = names.get(i).map(String::as_str).unwrap_or("?");
        write!(
            out,
            "{i}  {name}  lane {}  colour {}  {}",
            row.lane,
            row.colour,
            kind_name(row.kind)
        )
        .expect("запись в String не отказывает");

        let segments = &layout.segments[i];
        if !segments.is_empty() {
            let mut ordered: Vec<&Segment> = Vec::with_capacity(segments.len());
            ordered.extend(
                segments
                    .iter()
                    .filter(|s| matches!(s, Segment::Through { .. })),
            );
            ordered.extend(
                segments
                    .iter()
                    .filter(|s| matches!(s, Segment::Merge { .. })),
            );
            ordered.extend(
                segments
                    .iter()
                    .filter(|s| matches!(s, Segment::Branch { .. })),
            );
            ordered.extend(
                segments
                    .iter()
                    .filter(|s| matches!(s, Segment::StemUp { .. } | Segment::StemDown { .. })),
            );
            let rendered: Vec<String> = ordered.iter().map(|s| segment_text(s)).collect();
            write!(out, "  {}", rendered.join(" | ")).expect("запись в String не отказывает");
        }
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{chunk, fixture};

    #[test]
    fn renders_linear_history() {
        let parsed = fixture::parse("a: b\nb: c\nc\n").unwrap();
        let l = chunk::layout(&parsed.topology);
        let text = render(&l, &parsed.names);
        assert_eq!(
            text,
            "0  a  lane 0  colour 0  Normal  stem-down 0 c0\n\
             1  b  lane 0  colour 0  Normal  stem-up 0 c0 | stem-down 0 c0\n\
             2  c  lane 0  colour 0  Root  stem-up 0 c0\n"
        );
    }

    #[test]
    fn renders_segments_after_the_node() {
        let parsed = fixture::parse("m: a, b\na: r\nb: r\nr\n").unwrap();
        let l = chunk::layout(&parsed.topology);
        let text = render(&l, &parsed.names);
        let line0 = text.lines().next().unwrap();
        assert_eq!(
            line0,
            "0  m  lane 0  colour 0  Merge  branch 0>1 c1 | stem-down 0 c0"
        );
    }
}
