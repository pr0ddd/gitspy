import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailableUpdateView } from '@/shared/api/types';

const { listeners } = vi.hoisted(() => ({
  listeners: [] as ((update: AvailableUpdateView | null) => void)[],
}));

vi.mock('@/shared/api/ipc', () => ({
  availableUpdate: vi.fn(() => Promise.resolve(null)),
  onUpdateAvailable: (handler: (update: AvailableUpdateView | null) => void) => {
    listeners.push(handler);
    return Promise.resolve(() => {});
  },
  onUpdateFailed: () => Promise.resolve(() => {}),
  installUpdate: vi.fn(() => Promise.resolve()),
  openUrl: vi.fn(() => Promise.resolve()),
}));

import * as ipc from '@/shared/api/ipc';
import { RELEASES_URL, takeUpdate, useAvailableUpdate } from './updater';

describe('the update offered in the bar', () => {
  beforeEach(() => {
    listeners.length = 0;
    vi.mocked(ipc.availableUpdate).mockReset().mockResolvedValue(null);
    vi.mocked(ipc.installUpdate).mockClear();
    vi.mocked(ipc.openUrl).mockClear();
  });

  it('asks what is already known on mount, so a mount after the check still shows the button', async () => {
    vi.mocked(ipc.availableUpdate).mockResolvedValue({ version: '1.3.0', installable: true });
    const { result } = renderHook(() => useAvailableUpdate());
    await waitFor(() =>
      expect(result.current?.version, 'the version found before the mount is not lost').toBe(
        '1.3.0',
      ),
    );
  });

  it('follows the background check, and forgets the update when the check says none', async () => {
    const { result } = renderHook(() => useAvailableUpdate());
    await act(async () => {
      for (const listener of listeners) listener({ version: '1.4.0', installable: true });
    });
    expect(result.current?.version).toBe('1.4.0');
    await act(async () => {
      for (const listener of listeners) listener(null);
    });
    expect(result.current, 'a button for a version that is no longer there would lie').toBeNull();
  });

  it('installs through the banner where we own the install, and opens the release page where the system does', async () => {
    await takeUpdate({ version: '1.3.0', installable: true });
    expect(ipc.installUpdate, 'the click is the install itself').toHaveBeenCalledOnce();
    expect(ipc.openUrl).not.toHaveBeenCalled();

    await takeUpdate({ version: '1.3.0', installable: false });
    expect(
      ipc.openUrl,
      'a deb or rpm is updated by dpkg or rpm, so we only point at the release',
    ).toHaveBeenCalledWith(RELEASES_URL);
  });
});
