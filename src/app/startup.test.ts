import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api/ipc', () => ({
  recentRepos: vi.fn(() => Promise.resolve([])),
  setAutofetchMinutes: vi.fn(() => Promise.resolve()),
  appReady: vi.fn(() => Promise.resolve()),
}));

import * as ipc from '@/shared/api/ipc';
import { useStartup } from './startup';

const pending = new Map<number, FrameRequestCallback>();
let lastFrame = 0;

const paint = async () => {
  await act(async () => {
    for (const [id, frame] of pending) {
      pending.delete(id);
      frame(0);
    }
  });
};

describe('the startup of the main window', () => {
  beforeEach(() => {
    pending.clear();
    lastFrame = 0;
    vi.mocked(ipc.appReady).mockClear();
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
      lastFrame += 1;
      pending.set(lastFrame, frame);
      return lastFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      pending.delete(id);
    });
  });

  it('reports its first paint once, so the banner hands the screen over exactly once', async () => {
    renderHook(() => useStartup(() => {}), { wrapper: StrictMode });

    expect(
      ipc.appReady,
      'reporting before the frame runs would hand over a window that has painted nothing',
    ).not.toHaveBeenCalled();

    await paint();

    expect(
      ipc.appReady,
      'a remounted effect must cancel its frame, otherwise the report arrives twice',
    ).toHaveBeenCalledTimes(1);
  });
});
