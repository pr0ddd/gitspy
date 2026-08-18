import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { pushFor } from '@/features/repo';
import { useAnimatedWhile } from './Toolbar';
import type { WorkingTreeView } from '@/shared/api/types';

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

describe('the icon animation while an operation runs', () => {
  it('starts with the operation and stops only at the end of a cycle, never mid-flight', () => {
    const { result, rerender } = renderHook(({ running }) => useAnimatedWhile(running), {
      initialProps: { running: false },
    });
    expect(result.current.animating).toBe(false);

    rerender({ running: true });
    expect(result.current.animating, 'the operation starts: the icon moves').toBe(true);

    rerender({ running: false });
    expect(result.current.animating, 'the operation ended mid-cycle: keep going').toBe(true);

    act(() => result.current.onAnimationIteration());
    expect(result.current.animating, 'the cycle ended: now the icon rests').toBe(false);
  });

  it('an iteration boundary while the operation still runs changes nothing', () => {
    const { result } = renderHook(() => useAnimatedWhile(true));
    act(() => result.current.onAnimationIteration());
    expect(result.current.animating).toBe(true);
  });
});
