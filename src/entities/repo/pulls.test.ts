import { describe, expect, it } from 'vitest';
import { pullAtRefs, pullsAfterFailure, pullsOf } from './pulls';
import type { PullView, RefView } from '@/shared/api/types';

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

describe('the pull request on a commit', () => {
  it('a local branch matches the head branch of the pull request by name', () => {
    expect(pullAtRefs([ref('localBranch', 'feature/x')], [pull('feature/x')])?.number).toBe(7);
  });

  it('a remote branch matches once the remote name is dropped', () => {
    expect(pullAtRefs([ref('remoteBranch', 'origin/feature/x')], [pull('feature/x')])?.number).toBe(
      7,
    );
  });

  it('other names and tags do not count as a pull request', () => {
    expect(pullAtRefs([ref('localBranch', 'feature/y')], [pull('feature/x')])).toBeNull();
    expect(pullAtRefs([ref('tag', 'feature/x')], [pull('feature/x')])).toBeNull();
  });

  it('a pull request from a fork is not found by branch name: that branch lives in another repository', () => {
    expect(
      pullAtRefs([ref('localBranch', 'feature/x')], [pull('feature/x', { fromFork: true })]),
    ).toBeNull();
  });
});

describe('the pull requests state after a failed request', () => {
  it('a missing connection is a state of the app, not an error', () => {
    expect(pullsAfterFailure({ code: 'host.noConnection', params: {} }, 'gitlab')).toEqual({
      kind: 'notConnected',
      host: 'gitlab',
    });
  });

  it('anything else is a failure the pane shows with a retry', () => {
    expect(pullsAfterFailure({ code: 'host.network', params: {} }, 'github')).toEqual({
      kind: 'failed',
    });
    expect(pullsAfterFailure(new Error('boom'), 'github')).toEqual({ kind: 'failed' });
  });

  it('only a ready state carries pull requests', () => {
    expect(pullsOf({ kind: 'loading' })).toEqual([]);
    expect(pullsOf({ kind: 'noHost' })).toEqual([]);
  });
});
