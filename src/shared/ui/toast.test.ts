import { describe, expect, it, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import i18next from '@/shared/config/i18n';
import {
  notifyCheckedOut,
  notifyCloned,
  notifyCopied,
  notifyDeleted,
  notifyHostConnected,
  notifyOperation,
  notifyOperationFailed,
  notifyRepoCreated,
} from '@/shared/ui/toast';
import type { Operation } from '@/shared/api/types';

vi.mock('sonner', () => {
  const base = vi.fn();
  return {
    toast: Object.assign(base, {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
    }),
  };
});

const EVERY_KIND: Record<Operation['kind'], null> = {
  writeCommitGraph: null,
  fetchDryRun: null,
  fetch: null,
  pull: null,
  pullFfOnly: null,
  pullRebase: null,
  push: null,
  pushForceWithLease: null,
  pushSetUpstream: null,
  checkout: null,
  checkoutTracking: null,
  branch: null,
  branchAt: null,
  branchDelete: null,
  branchRename: null,
  amendMessage: null,
  merge: null,
  mergeAbort: null,
  mergeContinue: null,
  rebase: null,
  cherryPick: null,
  revert: null,
  drop: null,
  reset: null,
  tagAt: null,
  annotatedTagAt: null,
  worktreeAdd: null,
  fetchInto: null,
  pushBranch: null,
  pushDelete: null,
  stash: null,
  stashPop: null,
  stashFile: null,
  discardAll: null,
};

describe('toasts — the outcome of an action only, in human words', () => {
  beforeEach(() => {
    vi.mocked(toast.loading).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.info).mockClear();
  });

  it('raises no toast when an operation starts — the progress indicator lives on the button', () => {
    notifyOperation({ kind: 'pull' });
    expect(vi.mocked(toast.loading).mock.calls.length, 'spinner toasts are gone for good').toBe(0);
    expect(vi.mocked(toast.success).mock.calls.length).toBe(1);
  });

  it('a copy is a fact, not an achievement: an info toast, with the copied value as its detail', () => {
    notifyCopied('fc4269b2');
    expect(vi.mocked(toast.info).mock.calls[0]?.[0]).toBe('Copied');
    expect(vi.mocked(toast.info).mock.calls[0]?.[1]).toEqual({ description: 'fc4269b2' });
    expect(vi.mocked(toast.success).mock.calls.length, 'not a success').toBe(0);
  });

  it('a pull that brought nothing raises two toasts: the fact in blue, naming the branch that did not move, then the success', () => {
    const nothing = { code: 0, stdout: 'Already up to date.\n', stderr: '' };
    notifyOperation({ kind: 'pull' }, nothing, { branch: 'develop', upstream: 'origin/develop' });

    expect(vi.mocked(toast.info).mock.calls[0]?.[0]).toBe('Already Up-to-Date');
    expect(vi.mocked(toast.info).mock.calls[0]?.[1]).toEqual({
      description: 'No merge necessary. Branch origin/develop was not moved.',
      duration: 5000,
    });
    expect(vi.mocked(toast.success).mock.calls[0]?.[0], 'and the pull itself').toBe(
      'Pulled Successfully',
    );
    expect(
      vi.mocked(toast.info).mock.invocationCallOrder[0],
      'the fact first, so the success is the front toast',
    ).toBeLessThan(vi.mocked(toast.success).mock.invocationCallOrder[0]);
  });

  it('the fact names the branch that did not move: the upstream for a pull, the merged branch for a merge, the source for a fast-forward', () => {
    const nothing = { code: 0, stdout: 'Already up to date.\n', stderr: '' };
    const detail = () =>
      (vi.mocked(toast.info).mock.calls.at(-1)?.[1] as { description?: string })?.description;

    notifyOperation(
      { kind: 'pullRebase' },
      { code: 0, stdout: 'Current branch develop is up to date.\n', stderr: '' },
      { branch: 'develop', upstream: 'origin/develop' },
    );
    expect(detail(), 'rebase pulls say it differently, the branch is still the upstream').toBe(
      'No merge necessary. Branch origin/develop was not moved.',
    );

    notifyOperation({ kind: 'merge', branch: 'feature' }, nothing, {
      branch: 'develop',
      upstream: null,
    });
    expect(detail()).toBe('No merge necessary. Branch feature was not moved.');

    notifyOperation(
      { kind: 'fetchInto', remote: '.', from: 'origin/main', into: 'main' },
      nothing,
      {
        branch: 'develop',
        upstream: null,
      },
    );
    expect(detail()).toBe('No merge necessary. Branch origin/main was not moved.');

    notifyOperation({ kind: 'pull' }, nothing, { branch: null, upstream: null });
    expect(detail(), 'no branch known: the title stands alone').toBeUndefined();
  });

  it('a pull that brought commits is the success it always was, and only that', () => {
    notifyOperation(
      { kind: 'pull' },
      { code: 0, stdout: 'Updating 1a2b3c..4d5e6f\nFast-forward\n', stderr: '' },
      { branch: 'develop', upstream: 'origin/develop' },
    );
    expect(vi.mocked(toast.success).mock.calls[0]?.[0]).toBe('Pulled Successfully');
    expect(vi.mocked(toast.info).mock.calls.length).toBe(0);
  });

  it('a push whose output happens to mention being up to date is still a push', () => {
    notifyOperation(
      { kind: 'push' },
      { code: 0, stdout: '', stderr: 'Everything up-to-date\n' },
      { branch: 'develop', upstream: 'origin/develop' },
    );
    expect(vi.mocked(toast.success).mock.calls[0]?.[0]).toBe('Pushed Successfully');
    expect(vi.mocked(toast.info).mock.calls.length).toBe(0);
  });

  it('every outcome carries the same detail theirs would: what went where, or the name of the thing', () => {
    const where = { branch: 'develop', upstream: 'origin/develop' };
    const detail = () =>
      (vi.mocked(toast.success).mock.calls.at(-1)?.[1] as { description?: string })?.description;

    notifyOperation({ kind: 'push' }, undefined, where);
    expect(detail(), 'a push says which branch went to which remote').toBe('develop to origin');
    notifyOperation({ kind: 'pushForceWithLease' }, undefined, where);
    expect(detail()).toBe('develop to origin');
    notifyOperation({ kind: 'push' }, undefined, { branch: 'develop', upstream: null });
    expect(detail(), 'without an upstream the remote is unknown: no detail').toBeUndefined();
    notifyOperation({ kind: 'pushBranch', remote: 'fork', branch: 'wip' }, undefined, where);
    expect(detail()).toBe('wip to fork');
    notifyOperation({ kind: 'pushSetUpstream', remote: 'origin', branch: 'wip' }, undefined, where);
    expect(detail()).toBe('wip to origin');

    notifyOperation({ kind: 'merge', branch: 'feature' }, undefined, where);
    expect(detail()).toBe('feature into develop');

    notifyOperation({ kind: 'checkout', branch: 'feature' });
    expect(detail(), 'a checkout names the ref').toBe('feature');
    notifyOperation({ kind: 'checkoutTracking', upstream: 'origin/feature', local: 'feature' });
    expect(detail()).toBe('feature');
    notifyCheckedOut('origin/feature');
    expect(detail()).toBe('origin/feature');

    notifyOperation({ kind: 'branch', name: 'wip', checkout: false });
    expect(detail(), 'a created branch is named').toBe('wip');
    notifyOperation({ kind: 'branchAt', name: 'wip', hash: 'abc' });
    expect(detail()).toBe('wip');
    notifyOperation({ kind: 'tagAt', name: 'v1', hash: 'abc' });
    expect(detail(), 'a created tag is named').toBe('v1');
    notifyOperation({ kind: 'annotatedTagAt', name: 'v1', message: 'm', hash: 'abc' });
    expect(detail()).toBe('v1');

    notifyOperation({ kind: 'branchRename', from: 'wip', to: 'feature' });
    expect(detail()).toBe('wip to feature');
    notifyOperation({ kind: 'branchDelete', name: 'feature' });
    expect(
      vi.mocked(toast.success).mock.calls.at(-1)?.[0],
      'a deletion names the branch in the title',
    ).toBe('Deleted: feature');
    expect(detail()).toBeUndefined();
    notifyOperation({ kind: 'pushDelete', remote: 'origin', branch: 'feature' });
    expect(detail()).toBe('origin/feature');

    notifyOperation({ kind: 'merge', branch: 'feature' }, undefined, {
      branch: null,
      upstream: null,
    });
    expect(vi.mocked(toast.success).mock.calls.at(-1)?.[0], 'a merge whose sides are unknown').toBe(
      'Merged Successfully',
    );
    expect(detail()).toBeUndefined();

    notifyOperation({ kind: 'pull' }, undefined, where);
    expect(detail(), 'a pull says nothing more, as theirs does not').toBeUndefined();
    notifyOperation({ kind: 'rebase', onto: 'main' });
    expect(detail()).toBeUndefined();
  });

  it('a toast stays as long as it takes to read: quick successes 3 s, the rest 5 s, failures 10 s', () => {
    const lastDuration = (fn: ReturnType<typeof vi.fn>) =>
      (fn.mock.calls.at(-1)?.[1] as { duration?: number })?.duration;

    notifyOperation({ kind: 'checkout', branch: 'main' });
    expect(lastDuration(vi.mocked(toast.success)), 'a checkout is glanced at').toBe(3000);
    notifyOperation({ kind: 'branch', name: 'wip', checkout: false });
    expect(lastDuration(vi.mocked(toast.success))).toBe(3000);
    notifyOperation({ kind: 'rebase', onto: 'main' });
    expect(lastDuration(vi.mocked(toast.success))).toBe(3000);
    notifyOperation({ kind: 'push' });
    expect(lastDuration(vi.mocked(toast.success)), 'a push too').toBe(3000);
    notifyOperation({ kind: 'pull' });
    expect(lastDuration(vi.mocked(toast.success)), 'a pull is read').toBe(5000);
    notifyOperation({ kind: 'branchDelete', name: 'wip' });
    expect(lastDuration(vi.mocked(toast.success)), 'a deletion is read').toBe(5000);
    notifyCheckedOut('main');
    expect(lastDuration(vi.mocked(toast.success))).toBe(3000);
    notifyDeleted('a.txt');
    expect(lastDuration(vi.mocked(toast.info))).toBe(5000);
    notifyOperationFailed({ kind: 'push' }, { code: 'exec.failed', params: {}, detail: 'x' });
    expect(lastDuration(vi.mocked(toast.error)), 'a failure is studied').toBe(10000);
  });

  it('deleting a file is a fact in blue that names the file', () => {
    notifyDeleted('apps/backend/tsoa.json');
    expect(vi.mocked(toast.info).mock.calls[0]?.[0]).toBe("Deleted 'apps/backend/tsoa.json'");
  });

  it('a checkout from the sidebar or a pull request says the same as the queued one, and names the ref', () => {
    notifyCheckedOut('feature');
    expect(vi.mocked(toast.success).mock.calls[0]?.[0]).toBe('Checkout Successful');
    expect(vi.mocked(toast.success).mock.calls[0]?.[1]).toMatchObject({ description: 'feature' });
  });

  it('a clone names the folder it made, a new repository is announced with its folder as the detail', () => {
    notifyCloned('/Users/me/src/gitspy');
    expect(vi.mocked(toast.success).mock.calls[0]?.[0]).toBe("Successfully cloned repo 'gitspy'");
    notifyRepoCreated('/Users/me/src/new-thing');
    expect(vi.mocked(toast.success).mock.calls[1]?.[0]).toBe('Successfully created repo');
    expect(vi.mocked(toast.success).mock.calls[1]?.[1]).toMatchObject({ description: 'new-thing' });
  });

  it('a host connection names the host by its label, not its id', () => {
    notifyHostConnected('github');
    expect(vi.mocked(toast.success).mock.calls[0]?.[0]).toBe('Connected to GitHub');
    notifyHostConnected('somewhere-else');
    expect(vi.mocked(toast.success).mock.calls[1]?.[0], 'an unknown id is shown as it is').toBe(
      'Connected to somewhere-else',
    );
  });

  it('names the outcome with a phrase, not a glued-together "branch finished"', () => {
    notifyOperation({ kind: 'branch', name: 'wip', checkout: false });
    expect(String(vi.mocked(toast.success).mock.calls[0]?.[0])).toBe('Created Successfully');
  });

  it('has a success and a failure phrase for every operation in the closed list', () => {
    for (const kind of Object.keys(EVERY_KIND)) {
      expect(i18next.exists(`toast.done.${kind}`), `toast.done.${kind} is missing`).toBe(true);
      expect(i18next.exists(`toast.fail.${kind}`), `toast.fail.${kind} is missing`).toBe(true);
    }
  });

  it('does not call a local fast-forward a fetch', () => {
    notifyOperation({ kind: 'fetchInto', remote: '.', from: 'origin/main', into: 'main' });
    expect(String(vi.mocked(toast.success).mock.calls[0]?.[0])).toMatch(/fast-forward/i);
  });

  it('reports a failure as an error toast with a human title and an explanation', () => {
    notifyOperationFailed({ kind: 'pull' }, { code: 'exec.pullDiverged', params: {} });
    const [title, options] = vi.mocked(toast.error).mock.calls[0] ?? [];
    expect(String(title)).toBe('Pull Failed');
    expect(String(options?.description ?? '')).toMatch(/diverged/i);
  });
});
