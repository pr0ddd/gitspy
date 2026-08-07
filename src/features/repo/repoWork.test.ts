import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/toast', () => ({ notifyError: vi.fn() }));

import { notifyError } from '@/toast';
import { workStore } from '@/entities/repo';
import { runRepoWork } from './repoWork';

beforeEach(() => {
  workStore.setState({ works: new Map() });
  vi.mocked(notifyError).mockClear();
});

describe('обёртка работ репозитория', () => {
  it('на время работы полоса занята, после — свободна', async () => {
    let during = false;
    const ok = await runRepoWork('/a', { kind: 'push' }, async () => {
      during = workStore.getState().works.has('/a');
    });
    expect(ok).toBe(true);
    expect(during).toBe(true);
    expect(workStore.getState().works.has('/a')).toBe(false);
  });

  it('повторный старт по занятому пути не выполняет работу', async () => {
    void runRepoWork('/a', { kind: 'push' }, () => new Promise(() => {}));
    const performed = vi.fn(async () => {});
    expect(await runRepoWork('/a', { kind: 'pull' }, performed)).toBe(false);
    expect(performed).not.toHaveBeenCalled();
  });

  it('ошибка работы уходит в тост и освобождает полосу', async () => {
    const ok = await runRepoWork('/a', { kind: 'push' }, async () => {
      throw new Error('boom');
    });
    expect(ok).toBe(false);
    expect(notifyError).toHaveBeenCalledOnce();
    expect(workStore.getState().works.has('/a')).toBe(false);
  });
});
