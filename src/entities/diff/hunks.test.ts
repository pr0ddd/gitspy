import { describe, expect, it } from 'vitest';
import { hiddenSpans, hunkLineRange, isGitlinkDiff, parseUnifiedDiff, patchFor } from './hunks';

const DIFF = [
  'diff --git a/code.txt b/code.txt',
  'index f028205..9a717e2 100644',
  '--- a/code.txt',
  '+++ b/code.txt',
  '@@ -1,4 +1,4 @@',
  '-top old',
  '+top new',
  ' line 1',
  ' line 2',
  ' line 3',
  '@@ -19,4 +19,4 @@ line 17',
  ' line 18',
  ' line 19',
  ' line 20',
  '-bottom old',
  '+bottom new',
  '',
].join('\n');

describe('parsing a real git diff into hunks', () => {
  it('splits the diff into the file header and two hunks with their positions', () => {
    const diff = parseUnifiedDiff(DIFF);
    if (!diff) throw new Error('this diff has hunks');
    expect(diff.hunks.length).toBe(2);
    expect(diff.hunks[0].heading).toBe('@@ -1,4 +1,4 @@');
    expect(diff.hunks[1].heading).toBe('@@ -19,4 +19,4 @@ line 17');
    expect(
      diff.hunks[0].newStart,
      'the position is what puts the hunk buttons on the right row',
    ).toBe(1);
    expect(diff.hunks[1].newStart).toBe(19);
  });

  it('carries start and length for both sides of a hunk: hiding the lines outside the hunks rests on that', () => {
    const diff = parseUnifiedDiff(DIFF);
    if (!diff) throw new Error('this diff has hunks');
    expect(diff.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 4, newStart: 1, newLines: 4 });
    expect(diff.hunks[1]).toMatchObject({ oldStart: 19, oldLines: 4, newStart: 19, newLines: 4 });
  });

  it('restores a length of one that the heading omits', () => {
    const diff = parseUnifiedDiff('@@ -3 +5 @@\n-x\n+y\n');
    if (!diff) throw new Error('this diff has a hunk');
    expect(diff.hunks[0]).toMatchObject({ oldStart: 3, oldLines: 1, newStart: 5, newLines: 1 });
  });
});

describe('hunk rows on the new side of the file', () => {
  it('computes the range from the already parsed hunk instead of reading the text again', () => {
    const diff = parseUnifiedDiff(DIFF);
    if (!diff) throw new Error('this diff has hunks');
    expect(hunkLineRange(diff.hunks[1])).toEqual({ from: 19, to: 22 });
  });

  it('does not turn the range inside out for a pure deletion hunk', () => {
    const diff = parseUnifiedDiff('@@ -3,2 +2,0 @@\n-a\n-b\n');
    if (!diff) throw new Error('this diff has a hunk');
    expect(
      hunkLineRange(diff.hunks[0]),
      'an end before the start is an address where the agent would find nothing',
    ).toEqual({ from: 2, to: 2 });
  });
});

describe('hiding the lines outside the hunks', () => {
  it('hides everything before, between and after the hunks, on both sides', () => {
    const diff = parseUnifiedDiff(DIFF);
    if (!diff) throw new Error('this diff has hunks');
    expect(hiddenSpans(diff.hunks, 22, 22)).toEqual({
      original: [{ from: 5, to: 18 }],
      modified: [{ from: 5, to: 18 }],
    });
  });

  it('produces no empty span above a hunk that starts at the first line', () => {
    const diff = parseUnifiedDiff('@@ -1,2 +1,2 @@\n-a\n+b\n c\n');
    if (!diff) throw new Error('this diff has a hunk');
    expect(hiddenSpans(diff.hunks, 10, 10)).toEqual({
      original: [{ from: 3, to: 10 }],
      modified: [{ from: 3, to: 10 }],
    });
  });

  it('hides the tail after the last hunk to the end of the file on each side', () => {
    const diff = parseUnifiedDiff('@@ -3,2 +3,3 @@\n x\n-a\n+b\n+c\n');
    if (!diff) throw new Error('this diff has a hunk');
    expect(hiddenSpans(diff.hunks, 8, 9)).toEqual({
      original: [
        { from: 1, to: 2 },
        { from: 5, to: 8 },
      ],
      modified: [
        { from: 1, to: 2 },
        { from: 6, to: 9 },
      ],
    });
  });

  it('reads an empty diff as no hunks at all, not as an empty list', () => {
    expect(parseUnifiedDiff('')).toBeNull();
  });

  it('makes the patch for a single hunk a byte-for-byte piece of the original diff', () => {
    const diff = parseUnifiedDiff(DIFF);
    if (!diff) throw new Error('this diff has hunks');
    expect(
      patchFor(diff, diff.hunks[1]),
      'git apply is strict about bytes, so the patch is glued from substrings of the original instead of being rebuilt',
    ).toBe(
      [
        'diff --git a/code.txt b/code.txt',
        'index f028205..9a717e2 100644',
        '--- a/code.txt',
        '+++ b/code.txt',
        '@@ -19,4 +19,4 @@ line 17',
        ' line 18',
        ' line 19',
        ' line 20',
        '-bottom old',
        '+bottom new',
        '',
      ].join('\n'),
    );
  });
});

describe('a gitlink does not pass for a text diff', () => {
  it('recognises the diff of a pointer to a nested repository', () => {
    const raw = [
      'diff --git a/sandbox b/sandbox',
      'index 8677392..1eb65eb 160000',
      '--- a/sandbox',
      '+++ b/sandbox',
      '@@ -1 +1 @@',
      '-Subproject commit 8677392aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '+Subproject commit 1eb65ebbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '',
    ].join('\n');
    expect(
      isGitlinkDiff(raw),
      'git apply cannot apply gitlink patches, so the hunk buttons have no place here',
    ).toBe(true);
    expect(isGitlinkDiff('diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-x\n+y\n')).toBe(false);
  });
});
