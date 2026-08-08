import type { Hunk, UnifiedDiff } from './hunks';

export type ReviewLine = {
  kind: 'context' | 'added' | 'removed';
  before: number | null;
  after: number | null;
  text: string;
};

export type ReviewGap = { kind: 'gap'; hidden: number; from: number; to: number };

export type ReviewPiece = ReviewLine | ReviewGap;

export type OpenedSpan = { from: number; to: number };

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

const endOf = (hunk: Hunk): number => hunk.oldStart + Math.max(hunk.oldLines, 1);

const gapBefore = (hunk: Hunk, after: number): ReviewGap | null => {
  const from = after;
  const to = hunk.oldStart - 1;
  if (to < from) return null;
  return { kind: 'gap', hidden: to - from + 1, from, to };
};

const wasOpened = (gap: ReviewGap, opened: OpenedSpan[]): boolean =>
  opened.some((span) => span.from <= gap.from && span.to >= gap.to);

export const reviewPieces = (diff: UnifiedDiff, opened: OpenedSpan[]): ReviewPiece[] => {
  const pieces: ReviewPiece[] = [];
  let readTo = 1;
  for (const hunk of diff.hunks) {
    const gap = gapBefore(hunk, readTo);
    if (gap && !wasOpened(gap, opened)) pieces.push(gap);
    pieces.push(...linesOfHunk(hunk));
    readTo = endOf(hunk);
  }
  return pieces;
};

export const expandedAround = (gap: ReviewGap, step: number): OpenedSpan => ({
  from: Math.max(1, gap.from - step),
  to: gap.to + step,
});
