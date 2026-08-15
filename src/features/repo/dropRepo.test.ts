import { describe, expect, it, vi } from 'vitest';
import * as ipc from '@/ipc';
import { notifyNotARepository } from '@/toast';
import { openDroppedPaths } from './dropRepo';

vi.mock('@/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  repositoryRoot: vi.fn(),
}));
vi.mock('@/toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  notifyNotARepository: vi.fn(),
  notifyError: vi.fn(),
}));

describe('папка, брошенная в окно', () => {
  it('открывается корень репозитория, а не то, что бросили: файл или подкаталог ведут к нему же', async () => {
    vi.mocked(ipc.repositoryRoot).mockResolvedValue('/work/gitspy');
    const openPath = vi.fn();

    await openDroppedPaths(['/work/gitspy/src/app/App.tsx'], openPath);

    expect(openPath).toHaveBeenCalledWith('/work/gitspy');
  });

  it('несколько путей из одного репозитория открывают его один раз', async () => {
    vi.mocked(ipc.repositoryRoot).mockResolvedValue('/work/gitspy');
    const openPath = vi.fn();

    await openDroppedPaths(['/work/gitspy/a', '/work/gitspy/b'], openPath);

    expect(openPath).toHaveBeenCalledTimes(1);
  });

  it('не репозиторий — не открывать, а сказать об этом', async () => {
    vi.mocked(ipc.repositoryRoot).mockResolvedValue(null);
    const openPath = vi.fn();

    await openDroppedPaths(['/Users/me/Downloads'], openPath);

    expect(openPath).not.toHaveBeenCalled();
    expect(notifyNotARepository).toHaveBeenCalledTimes(1);
  });
});
