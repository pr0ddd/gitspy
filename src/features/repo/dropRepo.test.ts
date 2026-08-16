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

describe('a folder dropped onto the window', () => {
  it('opens the repository root rather than what was dropped: a file or a subdirectory leads to the same root', async () => {
    vi.mocked(ipc.repositoryRoot).mockResolvedValue('/work/gitspy');
    const openPath = vi.fn();

    await openDroppedPaths(['/work/gitspy/src/app/App.tsx'], openPath);

    expect(openPath).toHaveBeenCalledWith('/work/gitspy');
  });

  it('opens one repository once even when several paths inside it are dropped', async () => {
    vi.mocked(ipc.repositoryRoot).mockResolvedValue('/work/gitspy');
    const openPath = vi.fn();

    await openDroppedPaths(['/work/gitspy/a', '/work/gitspy/b'], openPath);

    expect(openPath).toHaveBeenCalledTimes(1);
  });

  it('opens nothing for a path that is not a repository and says so instead', async () => {
    vi.mocked(ipc.repositoryRoot).mockResolvedValue(null);
    const openPath = vi.fn();

    await openDroppedPaths(['/Users/me/Downloads'], openPath);

    expect(openPath).not.toHaveBeenCalled();
    expect(notifyNotARepository).toHaveBeenCalledTimes(1);
  });
});
