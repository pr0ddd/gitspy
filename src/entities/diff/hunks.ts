export type Hunk = { heading: string; newStart: number; raw: string };
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
    const place = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(heading);
    return { heading, newStart: place ? Number(place[1]) : 1, raw };
  });
  return { header, hunks };
}

export const patchFor = (diff: UnifiedDiff, hunk: Hunk): string => diff.header + hunk.raw;

export const isGitlinkDiff = (raw: string): boolean =>
  /(^|\n)[-+]Subproject commit /.test(raw);
