import { describe, expect, it } from 'vitest';
import { emptyPicks, parseConflictFile } from './conflictFile';
import {
  blockState,
  gutterTarget,
  outputLayout,
  paneLayout,
  withBlock,
  withEverySide,
  withLine,
} from './conflictLayout';

const FILE = [
  'top',
  '<<<<<<< HEAD',
  'ours 1',
  'ours 2',
  'ours 3',
  '=======',
  'theirs 1',
  '>>>>>>> topic',
  'middle',
  '<<<<<<< HEAD',
  '=======',
  'only theirs',
  '>>>>>>> topic',
  'bottom',
].join('\n');

const blocks = parseConflictFile(FILE);

describe('laying the sides out as whole texts', () => {
  it('a side is the common lines with its own version of every conflict, and knows where each block sits', () => {
    const a = paneLayout(blocks, 'a');
    const b = paneLayout(blocks, 'b');

    expect(a.text.split('\n')).toEqual(['top', 'ours 1', 'ours 2', 'ours 3', 'middle', 'bottom']);
    expect(a.places).toEqual([
      { at: 1, from: 2, to: 4 },
      { at: 3, from: 6, to: 5 },
    ]);
    expect(b.text.split('\n')).toEqual(['top', 'theirs 1', 'middle', 'only theirs', 'bottom']);
    expect(b.places).toEqual([
      { at: 1, from: 2, to: 2 },
      { at: 3, from: 4, to: 4 },
    ]);
  });

  it('an empty side of a block still has a place: the line where the block would begin', () => {
    const a = paneLayout(blocks, 'a');

    expect(
      gutterTarget(a, 6),
      'the second block has nothing on side A, its glyph sits on line 6',
    ).toEqual({
      at: 3,
      index: null,
    });
    expect(gutterTarget(a, 3)).toEqual({ at: 1, index: 1 });
    expect(gutterTarget(a, 1), 'a common line belongs to no block').toBeNull();
  });
});

describe('the output', () => {
  it('is what will be saved: picked lines in order, ours before theirs, and remembers where each came from', () => {
    let picks = emptyPicks(blocks);
    picks = withLine(picks, 'a', 1, 2);
    picks = withLine(picks, 'b', 1, 0);
    picks = withBlock(picks, blocks, 'b', 3, true);

    const out = outputLayout(blocks, picks);

    expect(out.text.split('\n')).toEqual([
      'top',
      'ours 3',
      'theirs 1',
      'middle',
      'only theirs',
      'bottom',
    ]);
    expect(out.origins).toEqual([
      { line: 2, side: 'a', at: 1, index: 2 },
      { line: 3, side: 'b', at: 1, index: 0 },
      { line: 5, side: 'b', at: 3, index: 0 },
    ]);
    expect(out.places).toEqual([
      { at: 1, from: 2, to: 3 },
      { at: 3, from: 5, to: 5 },
    ]);
  });

  it('an unresolved block shows the base version, marked as such, until a side is picked', () => {
    const withBase = parseConflictFile(
      [
        'top',
        '<<<<<<< HEAD',
        'ours',
        '||||||| base',
        'base 1',
        'base 2',
        '=======',
        'theirs',
        '>>>>>>> t',
        'bottom',
      ].join('\n'),
    );
    const out = outputLayout(withBase, emptyPicks(withBase));

    expect(out.text.split('\n')).toEqual(['top', 'base 1', 'base 2', 'bottom']);
    expect(out.origins).toEqual([
      { line: 2, side: 'base', at: 1, index: 0 },
      { line: 3, side: 'base', at: 1, index: 1 },
    ]);
    expect(out.places[0]).toEqual({ at: 1, from: 2, to: 3 });
  });

  it('a block without a base version and without picks is a gap of zero lines', () => {
    const out = outputLayout(blocks, emptyPicks(blocks));

    expect(out.text.split('\n')).toEqual(['top', 'middle', 'bottom']);
    expect(out.places[0]).toEqual({ at: 1, from: 2, to: 1 });
  });
});

describe('the block checkbox', () => {
  it('reads none, some or all from the picks of that side', () => {
    const block = blocks[1] as Extract<(typeof blocks)[number], { kind: 'conflict' }>;
    let picks = emptyPicks(blocks);
    expect(blockState(block, 'a', picks, 1)).toBe('none');
    picks = withLine(picks, 'a', 1, 0);
    expect(blockState(block, 'a', picks, 1)).toBe('some');
    picks = withBlock(picks, blocks, 'a', 1, true);
    expect(blockState(block, 'a', picks, 1)).toBe('all');
    picks = withBlock(picks, blocks, 'a', 1, false);
    expect(blockState(block, 'a', picks, 1)).toBe('none');
  });

  it('the header checkbox takes or drops every block of that side, leaving the other side alone', () => {
    let picks = withLine(emptyPicks(blocks), 'b', 1, 0);
    picks = withEverySide(picks, blocks, 'a', true);

    expect(picks[1].a.size).toBe(3);
    expect(picks[3].a.size, 'an empty side has nothing to take').toBe(0);
    expect(picks[1].b.size, 'side B is untouched').toBe(1);
  });
});
