import { describe, expect, it } from 'vitest';
import { wipContent, wipInputShown } from './wip';
import type { RowView } from './types';

type WipRow = Extract<RowView, { kind: 'workingTree' }>;

const wip = (over: Partial<WipRow> = {}): WipRow => ({
  kind: 'workingTree',
  index: 0,
  lane: 0,
  colour: 0,
  node: 0,
  added: 1,
  modified: 2,
  deleted: 0,
  conflicts: 0,
  inProgress: null,
  ...over,
});

describe('единственное решение о содержимом строки WIP', () => {
  it('в покое строка показывает счётчики', () => {
    expect(wipContent(wip())).toBe('counters');
  });

  it('конфликтное слияние вытесняет счётчики баннером', () => {
    expect(wipContent(wip({ conflicts: 2, inProgress: 'merge' }))).toBe('conflictBanner');
  });

  it('конфликтные буквы без слияния — ещё не баннер', () => {
    expect(
      wipContent(wip({ conflicts: 1 })),
      'без MERGE_HEAD это просто файлы с плохими буквами, слияние не идёт',
    ).toBe('counters');
  });

  it('инпут сообщения живёт только над счётчиками', () => {
    expect(wipInputShown(wip(), 0)).toBe(true);
    expect(
      wipInputShown(wip({ conflicts: 2, inProgress: 'merge' }), 0),
      'коммитить посреди конфликтов нельзя — инпуту нечего делать поверх баннера',
    ).toBe(false);
  });

  it('инпут исчезает вместе со строкой при прокрутке и на чужих строках', () => {
    expect(wipInputShown(wip(), 3)).toBe(false);
    expect(wipInputShown(undefined, 0)).toBe(false);
  });
});
