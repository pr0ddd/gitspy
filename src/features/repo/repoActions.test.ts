import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/toast', () => ({
  notifyError: vi.fn(),
  notifyCopied: vi.fn(),
  notifyOperation: vi.fn(),
  notifyOperationFailed: vi.fn(),
}));
vi.mock('@/ipc', () => ({
  runOperation: vi.fn(),
  resolveAvatars: vi.fn(() => Promise.resolve()),
  checkoutRef: vi.fn(() => Promise.resolve()),
  openUrl: vi.fn(() => Promise.resolve()),
}));

import * as ipc from '@/ipc';
import { notifyOperation, notifyOperationFailed } from '@/toast';
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

  it('a push that goes through is announced and the repository re-read', async () => {
    vi.mocked(ipc.runOperation).mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    const reload = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useOperations('/repo', reload));

    act(() => result.current.runOperation({ kind: 'push' }));
    await settle();

    expect(notifyOperation).toHaveBeenCalledWith({ kind: 'push' });
    expect(reload).toHaveBeenCalledWith('/repo');
  });
});
