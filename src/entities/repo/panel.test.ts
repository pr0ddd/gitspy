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
  committer: 'pr0d',
  committerEmail: 'p@e',
  committerTime: 0,
  subject: 'subject',
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

describe('which details pane is shown on the right', () => {
  it('follows the selected row, not the tab', () => {
    expect(panelFor(commit, 10)).toBe('commit');
    expect(panelFor(workingTree, 10)).toBe('workingTree');
  });

  it('reads a row that has not arrived yet as loading, not as nothing being selected', () => {
    expect(panelFor(undefined, 10)).toBe('loading');
  });

  it('does not leave an empty repository loading forever', () => {
    expect(panelFor(undefined, 0)).toBe('noCommits');
    expect(panelFor(commit, 0)).toBe('noCommits');
  });
});
