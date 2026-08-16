import { describe, expect, it } from 'vitest';
import { pushFor } from './Toolbar';
import type { WorkingTreeView } from '@/types';

const tree = (patch: Partial<WorkingTreeView>): WorkingTreeView => ({
  branch: 'master',
  upstream: null,
  remotes: [],
  ahead: 0,
  behind: 0,
  staged: 0,
  unstaged: 0,
  conflicts: 0,
  inProgress: null,
  merging: null,
  entries: [],
  ...patch,
});

describe('choosing the push by the state of the branch', () => {
  it('with an upstream a plain push goes out', () => {
    expect(pushFor(tree({ upstream: 'origin/master' }))).toEqual({
      kind: 'push',
    });
  });

  it('without an upstream the push sets one explicitly, not silently', () => {
    expect(pushFor(tree({ remotes: ['origin'] }))).toEqual({
      kind: 'pushSetUpstream',
      remote: 'origin',
      branch: 'master',
    });
  });

  it('with no remote at all there is nowhere to push, and the button admits it', () => {
    expect(pushFor(tree({}))).toBeNull();
  });

  it('on a detached HEAD there is no branch, so there is no push either', () => {
    expect(pushFor(tree({ branch: null, remotes: ['origin'] }))).toBeNull();
  });
});
