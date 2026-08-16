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

describe('разбор файла с маркерами конфликта', () => {
  it('файл распадается на общие куски и конфликтные блоки', () => {
    const blocks = parseConflictFile(MERGED);
    expect(blocks.map((b) => b.kind)).toEqual([
      'common',
      'conflict',
      'common',
      'conflict',
      'common',
    ]);
    const first = blocks[1];
    if (first.kind !== 'conflict') throw new Error('второй блок обязан быть конфликтом');
    expect(first.ours).toEqual(['  return `Good day`;']);
    expect(first.theirs).toEqual(['  return `Hi there!`;']);
  });

  it('маркеры diff3 отдают ещё и базу', () => {
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
    if (conflict.kind !== 'conflict') throw new Error('в середине конфликт');
    expect(conflict.base, 'база между ||||||| и ======= нужна для непочатого Output').toEqual([
      'base',
    ]);
    expect(conflict.ours).toEqual(['ours']);
    expect(conflict.theirs).toEqual(['theirs']);
  });

  it('файл без маркеров — один общий кусок', () => {
    const blocks = parseConflictFile('a\nb');
    expect(blocks).toEqual([{ kind: 'common', lines: ['a', 'b'] }]);
  });
});

describe('сборка Output из выбранных строк', () => {
  const blocks = parseConflictFile(MERGED);

  it('никого не выбрали — конфликтные места пустые, общие куски на месте', () => {
    const text = composeOutput(blocks, emptyPicks(blocks));
    expect(text).toBe(['export function greet() {', '}', 'shared();', 'tail();'].join('\n'));
  });

  it('выбранные строки обеих сторон входят в порядке: сначала A, потом B', () => {
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
