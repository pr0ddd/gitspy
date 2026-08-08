import type { Hunk, UnifiedDiff } from './hunks';

export type ReviewLine = {
  kind: 'context' | 'added' | 'removed';
  before: number | null;
  after: number | null;
  text: string;
};

const bodyOf = (hunk: Hunk): string[] => {
  const lines = hunk.raw.split('\n');
  const body = lines.slice(1);
  if (body.at(-1) === '') body.pop();
  return body.filter((line) => !line.startsWith('\\'));
};

const linesOfHunk = (hunk: Hunk): ReviewLine[] => {
  let before = hunk.oldStart;
  let after = hunk.newStart;
  return bodyOf(hunk).map((line) => {
    const text = line.slice(1);
    if (line.startsWith('+')) return { kind: 'added', before: null, after: after++, text };
    if (line.startsWith('-')) return { kind: 'removed', before: before++, after: null, text };
    return { kind: 'context', before: before++, after: after++, text };
  });
};

export const reviewLines = (diff: UnifiedDiff): ReviewLine[] =>
  diff.hunks.flatMap(linesOfHunk);
