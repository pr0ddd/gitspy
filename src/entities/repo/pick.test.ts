import { describe, expect, it } from 'vitest';
import { pickAfterMove, pickNext, samePick } from './pick';

const files = ['a.ts', 'b.ts', 'c.ts'];

describe('what to select in place of a file that is gone', () => {
  it('takes the next file in the list, so that staging one after another needs no mouse', () => {
    expect(pickNext(files, 'a.ts')).toBe('b.ts');
    expect(pickNext(files, 'b.ts')).toBe('c.ts');
  });

  it('falls back to the previous file for the last one, because there is nothing after it', () => {
    expect(pickNext(files, 'c.ts')).toBe('b.ts');
  });

  it('the last remaining file leaves nothing to select', () => {
    expect(pickNext(['a.ts'], 'a.ts')).toBe(null);
  });

  it('a path that is not in the list selects nothing', () => {
    expect(pickNext(files, 'z.ts')).toBe(null);
  });
});

describe('comparing selections', () => {
  it('the same file in the same section is the same selection', () => {
    expect(samePick({ path: 'a.ts', staged: false }, { path: 'a.ts', staged: false })).toBe(true);
  });

  it('the same path in the other section is a different selection: these are two different rows', () => {
    expect(samePick({ path: 'a.ts', staged: false }, { path: 'a.ts', staged: true })).toBe(false);
  });

  it('an empty selection equals an empty one, otherwise pressing again would redraw the panel', () => {
    expect(samePick(null, null)).toBe(true);
    expect(samePick(null, { path: 'a.ts', staged: false })).toBe(false);
  });
});

describe('what to select after a file moves to the other section', () => {
  const unstaged = ['a.ts', 'b.ts', 'c.ts'];
  const treeAfter = (moved: string) => [
    ...unstaged.filter((p) => p !== moved).map((path) => ({ path, staged: false })),
    { path: moved, staged: true },
  ];

  it('moves to the next file of the same section, so staging one after another needs no mouse', () => {
    expect(pickAfterMove(unstaged, 'a.ts', false, treeAfter('a.ts'))).toEqual({
      path: 'b.ts',
      staged: false,
    });
  });

  it('takes the next one from the fresh tree: if git has already taken it away, the selection does not hang on a ghost', () => {
    const after = [
      { path: 'c.ts', staged: false },
      { path: 'a.ts', staged: true },
    ];
    expect(
      pickAfterMove(unstaged, 'a.ts', false, after),
      'b.ts disappeared between the command and the response, so the selection goes to the moved file itself in its new section',
    ).toEqual({ path: 'a.ts', staged: true });
  });

  it('the last file of a section follows itself into the neighbouring section', () => {
    expect(pickAfterMove(['a.ts'], 'a.ts', false, [{ path: 'a.ts', staged: true }])).toEqual({
      path: 'a.ts',
      staged: true,
    });
  });

  it('a file that is nowhere after the operation clears the selection', () => {
    expect(pickAfterMove(['a.ts'], 'a.ts', false, [])).toBe(null);
  });
});
