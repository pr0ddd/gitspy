import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/ui/toast', () => ({ notifyError: vi.fn() }));

import { notifyError } from '@/shared/ui/toast';
import { workStore } from '@/entities/repo';
import { runRepoWork } from './repoWork';

beforeEach(() => {
  workStore.setState({ works: new Map() });
  vi.mocked(notifyError).mockClear();
});

describe('the repository work wrapper', () => {
  it('holds the lane busy while the work runs and frees it afterwards', async () => {
    let during = false;
    const ok = await runRepoWork('/a', { kind: 'push' }, async () => {
      during = workStore.getState().works.has('/a');
    });
    expect(ok).toBe(true);
    expect(during).toBe(true);
    expect(workStore.getState().works.has('/a')).toBe(false);
  });

  it('performs no work when the path is already busy', async () => {
    void runRepoWork('/a', { kind: 'push' }, () => new Promise(() => {}));
    const performed = vi.fn(async () => {});
    expect(await runRepoWork('/a', { kind: 'pull' }, performed)).toBe(false);
    expect(performed).not.toHaveBeenCalled();
  });

  it('sends a failure to the toast and frees the lane', async () => {
    const ok = await runRepoWork('/a', { kind: 'push' }, async () => {
      throw new Error('boom');
    });
    expect(ok).toBe(false);
    expect(notifyError).toHaveBeenCalledOnce();
    expect(workStore.getState().works.has('/a')).toBe(false);
  });
});
