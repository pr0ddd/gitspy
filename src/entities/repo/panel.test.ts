import { describe, expect, it } from 'vitest';
import { panelFor } from './panel';
import type { RowView } from '@/types';

const commit = {
  kind: 'commit',
  index: 3,
  lane: 0,
  colour: 0,
  node: 0,
  hash: 'abc',
  author: 'pr0d',
  email: 'p@e',
  time: 0,
  subject: 'тема',
  body: '',
} satisfies RowView;

const workingTree = {
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
} satisfies RowView;

describe('какая панель показывается справа', () => {
  it('панель следует за выделением, а не за вкладкой', () => {
    expect(panelFor(commit, 10)).toBe('commit');
    expect(panelFor(workingTree, 10)).toBe('workingTree');
  });

  it('строка ещё не пришла — это загрузка, а не отсутствие выбора', () => {
    expect(panelFor(undefined, 10)).toBe('loading');
  });

  it('пустой репозиторий — это не вечная загрузка', () => {
    expect(panelFor(undefined, 0)).toBe('noCommits');
    expect(panelFor(commit, 0)).toBe('noCommits');
  });
});
