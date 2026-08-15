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

describe('операция уже сделана', () => {
  it('стейдж уже застейдженного файла отбрасывается: git на нём падает pathspec-ошибкой', () => {
    const staged = treeOf([{ path: 'a.ts', staged: true, letter: 'D' }]);

    expect(
      stillNeeded({ kind: 'stage', paths: ['a.ts'] }, staged),
      'удалённого файла нет ни в дереве, ни в индексе — git add по нему только ругается',
    ).toBeNull();
  });

  it('из группы остаются только те пути, которым операция ещё нужна', () => {
    const tree = treeOf([
      { path: 'a.ts', staged: false },
      { path: 'b.ts', staged: true },
    ]);

    expect(stillNeeded({ kind: 'stage', paths: ['a.ts', 'b.ts'] }, tree)).toEqual({
      kind: 'stage',
      paths: ['a.ts'],
    });
  });

  it('снятие со стейджа смотрит на другую сторону, чем стейдж', () => {
    const tree = treeOf([{ path: 'a.ts', staged: true }]);

    expect(stillNeeded({ kind: 'unstage', paths: ['a.ts'] }, tree)).toEqual({
      kind: 'unstage',
      paths: ['a.ts'],
    });
    expect(stillNeeded({ kind: 'unstage', paths: ['b.ts'] }, tree)).toBeNull();
  });

  it('операции без путей проходят всегда: «застейджить всё» решает сам git', () => {
    const empty = treeOf([]);

    expect(stillNeeded({ kind: 'stageAll' }, empty)).toEqual({ kind: 'stageAll' });
  });
});

describe('очередь операций над путями', () => {
  it('вторая операция ждёт первую: параллельные git add дерутся за index.lock', async () => {
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

    expect(order, 'вторая не стартует, пока первая не ответила').toEqual(['start:a.ts']);

    releaseFirst(treeOf([{ path: 'b.ts', staged: false }]));
    await first;
    await second;

    expect(order).toEqual(['start:a.ts', 'start:b.ts']);
  });

  it('повторный щелчок по строке не доходит до git: состояние из ответа первой операции уже другое', async () => {
    const perform = vi.fn(() => Promise.resolve(treeOf([{ path: 'a.ts', staged: true }])));
    const tree = treeOf([{ path: 'a.ts', staged: false }]);

    const first = queuePathOperation('/repo2', { kind: 'stage', paths: ['a.ts'] }, tree, perform);
    const second = queuePathOperation('/repo2', { kind: 'stage', paths: ['a.ts'] }, tree, perform);
    await first;
    const after = await second;

    expect(perform, 'git позвали ровно один раз').toHaveBeenCalledTimes(1);
    expect(after?.entries[0].staged, 'а вызывающий получил свежее дерево, а не ошибку').toBe(true);
  });

  it('упавшая операция не хоронит очередь: следующая всё равно выполняется', async () => {
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

describe('очередь помнит последний ответ git', () => {
  it('третье нажатие судится по дереву из ответа, а не по устаревшему пропсу: React мог не успеть', async () => {
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

    expect(perform, 'все три файла ушли в git, хотя вызывающий трижды передал одно старое дерево').toHaveBeenCalledTimes(3);
  });
});
