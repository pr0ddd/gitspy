export type Hunk = {
  heading: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  raw: string;
};
export type UnifiedDiff = { header: string; hunks: Hunk[] };

export function parseUnifiedDiff(text: string): UnifiedDiff | null {
  const starts: number[] = [];
  if (text.startsWith('@@ ')) starts.push(0);
  for (let at = text.indexOf('\n@@ '); at !== -1; at = text.indexOf('\n@@ ', at + 1)) {
    starts.push(at + 1);
  }
  if (starts.length === 0) return null;

  const header = text.slice(0, starts[0]);
  const hunks = starts.map((from, i) => {
    const raw = text.slice(from, starts[i + 1] ?? text.length);
    const heading = raw.slice(0, raw.indexOf('\n'));
    const place = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(heading);
    return {
      heading,
      oldStart: place ? Number(place[1]) : 1,
      oldLines: place?.[2] === undefined ? 1 : Number(place[2]),
      newStart: place ? Number(place[3]) : 1,
      newLines: place?.[4] === undefined ? 1 : Number(place[4]),
      raw,
    };
  });
  return { header, hunks };
}

export const patchFor = (diff: UnifiedDiff, hunk: Hunk): string => diff.header + hunk.raw;

export const isGitlinkDiff = (raw: string): boolean =>
  /(^|\n)[-+]Subproject commit /.test(raw);

export type HiddenSpan = { from: number; to: number };

const spansBetween = (
  bounds: Array<{ start: number; lines: number }>,
  lineCount: number,
): HiddenSpan[] => {
  const spans: HiddenSpan[] = [];
  let visibleUntil = 0;
  for (const { start, lines } of bounds) {
    if (start > visibleUntil + 1) spans.push({ from: visibleUntil + 1, to: start - 1 });
    visibleUntil = Math.max(visibleUntil, start + lines - 1);
  }
  if (visibleUntil < lineCount) spans.push({ from: visibleUntil + 1, to: lineCount });
  return spans;
};

export const hiddenSpans = (
  hunks: readonly Hunk[],
  originalLineCount: number,
  modifiedLineCount: number,
): { original: HiddenSpan[]; modified: HiddenSpan[] } => ({
  original: spansBetween(
    hunks.map((h) => ({ start: h.oldStart, lines: h.oldLines })),
    originalLineCount,
  ),
  modified: spansBetween(
    hunks.map((h) => ({ start: h.newStart, lines: h.newLines })),
    modifiedLineCount,
  ),
});
