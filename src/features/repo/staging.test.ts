import { describe, expect, it, vi } from 'vitest';
import { queuePathOperation, stillNeeded } from './staging';
import type { PathOperation, WorkingTreeView } from '@/types';

const treeOf = (entries: Array<{ path: string; staged: boolean; letter?: string }>) =>
  ({
    branch: 'work',
    upstream: null,
    remotes: [],
    ahead: 0,
    behind: 0,
    staged: entries.filter((e) => e.staged).length,
    unstaged: entries.filter((e) => !e.staged).length,
    conflicts: 0,
    inProgress: null,
    merging: null,
    entries: entries.map(({ path, staged, letter }) => ({
      path,
      staged,
      letter: letter ?? 'M',
      oldPath: null,
    })),
  }) as WorkingTreeView;

describe('an operation that is already done', () => {
  it('drops a stage of an already staged file: git fails on it with a pathspec error', () => {
    const staged = treeOf([{ path: 'a.ts', staged: true, letter: 'D' }]);

    expect(
      stillNeeded({ kind: 'stage', paths: ['a.ts'] }, staged),
      'a deleted file is in neither the working tree nor the unstaged side of the index — git add on it only complains',
    ).toBeNull();
  });

  it('keeps only the paths in the group that still need the operation', () => {
    const tree = treeOf([
      { path: 'a.ts', staged: false },
      { path: 'b.ts', staged: true },
    ]);

    expect(stillNeeded({ kind: 'stage', paths: ['a.ts', 'b.ts'] }, tree)).toEqual({
      kind: 'stage',
      paths: ['a.ts'],
    });
  });

  it('makes unstage look at the other side of the index than stage does', () => {
    const tree = treeOf([{ path: 'a.ts', staged: true }]);

    expect(stillNeeded({ kind: 'unstage', paths: ['a.ts'] }, tree)).toEqual({
      kind: 'unstage',
      paths: ['a.ts'],
    });
    expect(stillNeeded({ kind: 'unstage', paths: ['b.ts'] }, tree)).toBeNull();
  });

  it('always lets an operation without paths through: git itself decides what "stage all" covers', () => {
    const empty = treeOf([]);

    expect(stillNeeded({ kind: 'stageAll' }, empty)).toEqual({ kind: 'stageAll' });
  });
});

describe('the queue of path operations', () => {
  it('makes the second operation wait for the first: parallel git add calls fight over index.lock', async () => {
    const order: string[] = [];
    let releaseFirst: (tree: WorkingTreeView) => void = () => {};
    const perform = vi.fn((operation: PathOperation) => {
      order.push(`start:${'paths' in operation ? operation.paths.join() : operation.kind}`);
      return new Promise<WorkingTreeView>((resolve) => {
        if (order.length === 1) releaseFirst = resolve;
        else resolve(treeOf([]));
      });
    });
    const tree = treeOf([
      { path: 'a.ts', staged: false },
      { path: 'b.ts', staged: false },
    ]);

    const first = queuePathOperation('/repo', { kind: 'stage', paths: ['a.ts'] }, tree, perform);
    const second = queuePathOperation('/repo', { kind: 'stage', paths: ['b.ts'] }, tree, perform);
    await Promise.resolve();

    expect(order, 'the second does not start until the first has answered').toEqual(['start:a.ts']);

    releaseFirst(treeOf([{ path: 'b.ts', staged: false }]));
    await first;
    await second;

    expect(order).toEqual(['start:a.ts', 'start:b.ts']);
  });

  it('never reaches git on a second click of the same row: the state from the first answer is already different', async () => {
    const perform = vi.fn(() => Promise.resolve(treeOf([{ path: 'a.ts', staged: true }])));
    const tree = treeOf([{ path: 'a.ts', staged: false }]);

    const first = queuePathOperation('/repo2', { kind: 'stage', paths: ['a.ts'] }, tree, perform);
    const second = queuePathOperation('/repo2', { kind: 'stage', paths: ['a.ts'] }, tree, perform);
    await first;
    const after = await second;

    expect(perform, 'git was called exactly once').toHaveBeenCalledTimes(1);
    expect(
      after?.entries[0].staged,
      'and the caller still got the fresh working tree back, not an error',
    ).toBe(true);
  });

  it('does not let a failed operation bury the queue: the next one still runs', async () => {
    const perform = vi.fn((operation: PathOperation) =>
      'paths' in operation && operation.paths[0] === 'bad.ts'
        ? Promise.reject(new Error('git failed'))
        : Promise.resolve(treeOf([])),
    );
    const tree = treeOf([
      { path: 'bad.ts', staged: false },
      { path: 'good.ts', staged: false },
    ]);

    const failing = queuePathOperation(
      '/repo3',
      { kind: 'stage', paths: ['bad.ts'] },
      tree,
      perform,
    );
    const next = queuePathOperation('/repo3', { kind: 'stage', paths: ['good.ts'] }, tree, perform);

    await expect(failing).rejects.toThrow('git failed');
    await next;

    expect(perform).toHaveBeenCalledTimes(2);
  });
});

describe('the queue remembers the last answer from git', () => {
  it('judges the third click by the working tree from the answer, not by the stale prop React has not re-rendered yet', async () => {
    const before = treeOf([
      { path: 'a.ts', staged: false },
      { path: 'b.ts', staged: false },
      { path: 'c.ts', staged: false },
    ]);
    const stale = before;
    const perform = vi.fn((operation: PathOperation) => {
      const paths = 'paths' in operation ? operation.paths : [];
      return Promise.resolve(
        treeOf(
          before.entries.map((entry) => ({
            path: entry.path,
            staged: entry.staged || paths.includes(entry.path),
          })),
        ),
      );
    });

    await queuePathOperation('/repo9', { kind: 'stage', paths: ['a.ts'] }, stale, perform);
    await queuePathOperation('/repo9', { kind: 'stage', paths: ['b.ts'] }, stale, perform);
    await queuePathOperation('/repo9', { kind: 'stage', paths: ['c.ts'] }, stale, perform);

    expect(
      perform,
      'all three files reached git even though the caller passed the same stale working tree three times',
    ).toHaveBeenCalledTimes(3);
  });
});
