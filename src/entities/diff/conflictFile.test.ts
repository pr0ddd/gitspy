import { describe, expect, it } from 'vitest';
import { composeOutput, emptyPicks, parseConflictFile, type Picks } from './conflictFile';

const MERGED = [
  'export function greet() {',
  '<<<<<<< HEAD',
  '  return `Good day`;',
  '=======',
  '  return `Hi there!`;',
  '>>>>>>> feature',
  '}',
  'shared();',
  '<<<<<<< HEAD',
  '  lower();',
  '=======',
  '  upper();',
  '  louder();',
  '>>>>>>> feature',
  'tail();',
].join('\n');

describe('parsing a file with conflict markers', () => {
  it('splits the file into common chunks and conflict blocks', () => {
    const blocks = parseConflictFile(MERGED);
    expect(blocks.map((b) => b.kind)).toEqual([
      'common',
      'conflict',
      'common',
      'conflict',
      'common',
    ]);
    const first = blocks[1];
    if (first.kind !== 'conflict') throw new Error('the second block must be a conflict');
    expect(first.ours).toEqual(['  return `Good day`;']);
    expect(first.theirs).toEqual(['  return `Hi there!`;']);
  });

  it('reads the base as well when the markers are diff3', () => {
    const withBase = [
      'a',
      '<<<<<<< HEAD',
      'ours',
      '||||||| merged common ancestors',
      'base',
      '=======',
      'theirs',
      '>>>>>>> feature',
      'b',
    ].join('\n');
    const blocks = parseConflictFile(withBase);
    const conflict = blocks[1];
    if (conflict.kind !== 'conflict') throw new Error('the middle block is a conflict');
    expect(
      conflict.base,
      'the base between ||||||| and ======= is what an untouched Output is built from',
    ).toEqual(['base']);
    expect(conflict.ours).toEqual(['ours']);
    expect(conflict.theirs).toEqual(['theirs']);
  });

  it('reads a file without markers as one common chunk', () => {
    const blocks = parseConflictFile('a\nb');
    expect(blocks).toEqual([{ kind: 'common', lines: ['a', 'b'] }]);
  });
});

describe('building the Output from the picked lines', () => {
  const blocks = parseConflictFile(MERGED);

  it('leaves the conflict spots empty and the common chunks in place when nothing is picked', () => {
    const text = composeOutput(blocks, emptyPicks(blocks));
    expect(text).toBe(['export function greet() {', '}', 'shared();', 'tail();'].join('\n'));
  });

  it('takes the picked lines from both sides in order: side A first, then side B', () => {
    const picks: Picks = emptyPicks(blocks);
    picks[1] = { a: new Set([0]), b: new Set([0]) };
    picks[3] = { a: new Set(), b: new Set([1]) };
    const text = composeOutput(blocks, picks);
    expect(text).toBe(
      [
        'export function greet() {',
        '  return `Good day`;',
        '  return `Hi there!`;',
        '}',
        'shared();',
        '  louder();',
        'tail();',
      ].join('\n'),
    );
  });
});
