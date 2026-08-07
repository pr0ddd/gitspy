import { describe, expect, it } from 'vitest';
import { pullAtRefs } from './pulls';
import type { PullView, RefView } from '@/types';

const ref = (kind: RefView['kind'], name: string): RefView => ({
  name,
  kind,
  commit: 0,
  oid: 'a'.repeat(40),
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
});

const pull = (headBranch: string, extra: Partial<PullView> = {}): PullView => ({
  number: 7,
  title: 'Fix the thing',
  draft: false,
  author: 'ada',
  authorAvatarUrl: '',
  headBranch,
  baseBranch: 'main',
  fromFork: false,
  updatedAt: '2026-08-06T00:00:00Z',
  mine: false,
  assignedToMe: false,
  awaitingMyReview: false,
  ...extra,
});

describe('пул-реквест на коммите', () => {
  it('локальная ветка совпадает с головой пулла по имени', () => {
    expect(pullAtRefs([ref('localBranch', 'feature/x')], [pull('feature/x')])?.number).toBe(7);
  });

  it('удалённая ветка совпадает без имени remote', () => {
    expect(pullAtRefs([ref('remoteBranch', 'origin/feature/x')], [pull('feature/x')])?.number).toBe(
      7,
    );
  });

  it('чужие имена и теги пуллом не считаются', () => {
    expect(pullAtRefs([ref('localBranch', 'feature/y')], [pull('feature/x')])).toBeNull();
    expect(pullAtRefs([ref('tag', 'feature/x')], [pull('feature/x')])).toBeNull();
  });

  it('пулл из форка по имени ветки не находится: ветка живёт в чужом репозитории', () => {
    expect(
      pullAtRefs([ref('localBranch', 'feature/x')], [pull('feature/x', { fromFork: true })]),
    ).toBeNull();
  });
});
