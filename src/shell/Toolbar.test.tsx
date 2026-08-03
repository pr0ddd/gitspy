import { describe, expect, it } from 'vitest';
import { pushFor } from './Toolbar';
import type { WorkingTreeView } from '../types';

const tree = (patch: Partial<WorkingTreeView>): WorkingTreeView => ({
  branch: 'master',
  upstream: null,
  remotes: [],
  ahead: 0,
  behind: 0,
  staged: 0,
  unstaged: 0,
  entries: [],
  ...patch,
});

describe('выбор push по состоянию ветки', () => {
  it('с upstream идёт обычный push', () => {
    expect(pushFor(tree({ upstream: 'origin/master' }))).toEqual({
      kind: 'push',
    });
  });

  it('без upstream push назначает его явно, а не молча', () => {
    expect(pushFor(tree({ remotes: ['origin'] }))).toEqual({
      kind: 'pushSetUpstream',
      remote: 'origin',
      branch: 'master',
    });
  });

  it('без единого remote пушить некуда, и кнопка это признаёт', () => {
    expect(pushFor(tree({}))).toBeNull();
  });

  it('в отсоединённой голове ветки нет, значит и push нет', () => {
    expect(pushFor(tree({ branch: null, remotes: ['origin'] }))).toBeNull();
  });
});
