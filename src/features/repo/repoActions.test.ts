import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/ui/toast', () => ({
  notifyError: vi.fn(),
  notifyCopied: vi.fn(),
  notifyCheckedOut: vi.fn(),
  notifyOperation: vi.fn(),
  notifyOperationFailed: vi.fn(),
}));
vi.mock('@/shared/api/ipc', () => ({
  runOperation: vi.fn(),
  resolveAvatars: vi.fn(() => Promise.resolve()),
  checkoutRef: vi.fn(() => Promise.resolve(null)),
  openUrl: vi.fn(() => Promise.resolve()),
}));

import * as ipc from '@/shared/api/ipc';
import { notifyCheckedOut, notifyOperation, notifyOperationFailed } from '@/shared/ui/toast';
import { workStore } from '@/entities/repo';
import { useOperations } from './repoActions';

const rejected = { code: 'exec.rejected', params: {}, detail: '! [rejected] main -> main' };
const settle = () => act(async () => {});

beforeEach(() => {
  workStore.setState({ works: new Map() });
  vi.mocked(ipc.runOperation).mockReset();
  vi.mocked(notifyOperation).mockClear();
  vi.mocked(notifyOperationFailed).mockClear();
});

describe('running an operation', () => {
  it('a push the remote rejects as non-fast-forward is offered a way out, not toasted as a failure', async () => {
    vi.mocked(ipc.runOperation).mockRejectedValue(rejected);
    const onPushRejected = vi.fn();
    const reload = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useOperations('/repo', reload, onPushRejected));

    act(() => result.current.runOperation({ kind: 'push' }));
    await settle();

    expect(onPushRejected).toHaveBeenCalledOnce();
    expect(notifyOperationFailed, 'the bar replaces the red toast').not.toHaveBeenCalled();
    expect(
      reload,
      'nothing changed in the repository, so nothing is re-read',
    ).not.toHaveBeenCalled();
  });

  it('the same rejection on a push that names a branch stays a toast: the bar only knows the current branch', async () => {
    vi.mocked(ipc.runOperation).mockRejectedValue(rejected);
    const onPushRejected = vi.fn();
    const { result } = renderHook(() =>
      useOperations('/repo', () => Promise.resolve(), onPushRejected),
    );

    act(() =>
      result.current.runOperation({ kind: 'pushBranch', remote: 'origin', branch: 'feature' }),
    );
    await settle();

    expect(onPushRejected).not.toHaveBeenCalled();
    expect(notifyOperationFailed).toHaveBeenCalledOnce();
  });

  it('any other push failure is still a toast', async () => {
    vi.mocked(ipc.runOperation).mockRejectedValue({ code: 'exec.failed', params: {}, detail: 'x' });
    const onPushRejected = vi.fn();
    const { result } = renderHook(() =>
      useOperations('/repo', () => Promise.resolve(), onPushRejected),
    );

    act(() => result.current.runOperation({ kind: 'push' }));
    await settle();

    expect(onPushRejected).not.toHaveBeenCalled();
    expect(notifyOperationFailed).toHaveBeenCalledOnce();
  });

  it('a push that goes through is announced with what git said, and the repository re-read', async () => {
    const outcome = { code: 0, stdout: '', stderr: 'Everything up-to-date\n' };
    vi.mocked(ipc.runOperation).mockResolvedValue(outcome);
    const reload = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useOperations('/repo', reload));

    act(() => result.current.runOperation({ kind: 'push' }));
    await settle();

    expect(
      notifyOperation,
      'the toast gets the outcome, so a pull that brought nothing can say so',
    ).toHaveBeenCalledWith({ kind: 'push' }, outcome, { branch: null, upstream: null });
    expect(reload).toHaveBeenCalledWith('/repo');
  });
});

describe('checking out a ref from the sidebar', () => {
  it('announces the branch git actually landed on, as the backend reports it', async () => {
    vi.mocked(ipc.checkoutRef).mockResolvedValue('feature');
    vi.mocked(notifyCheckedOut).mockClear();
    const reload = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useOperations('/repo', reload));

    act(() =>
      result.current.checkoutRef({
        name: 'origin/feature',
        kind: 'remoteBranch',
        commit: 0,
        oid: 'x',
        isHead: false,
        upstream: null,
        ahead: 0,
        behind: 0,
        gone: false,
      }),
    );
    await settle();

    expect(notifyCheckedOut, 'origin/feature lands on the local feature').toHaveBeenCalledWith(
      'feature',
    );
    expect(reload).toHaveBeenCalledWith('/repo');
  });

  it('says nothing when there was nothing to check out', async () => {
    vi.mocked(ipc.checkoutRef).mockResolvedValue(null);
    vi.mocked(notifyCheckedOut).mockClear();
    const { result } = renderHook(() => useOperations('/repo', () => Promise.resolve()));

    act(() =>
      result.current.checkoutRef({
        name: 'v1.0',
        kind: 'tag',
        commit: 0,
        oid: 'x',
        isHead: false,
        upstream: null,
        ahead: 0,
        behind: 0,
        gone: false,
      }),
    );
    await settle();

    expect(notifyCheckedOut).not.toHaveBeenCalled();
  });
});
