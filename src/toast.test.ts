import { describe, expect, it, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { notifyOperation, notifyOperationFailed } from './toast';
import type { Operation } from './types';

vi.mock('sonner', () => {
  const base = vi.fn();
  return {
    toast: Object.assign(base, {
      success: vi.fn(),
      error: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
    }),
  };
});

const pull: Operation = { kind: 'pull' };

describe('тосты — только исход действия', () => {
  beforeEach(() => {
    vi.mocked(toast.loading).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('запуск операции не рождает ни одного тоста — индикатор живёт у кнопки', () => {
    notifyOperation(pull);
    expect(vi.mocked(toast.loading).mock.calls.length, 'спиннер-тостов больше нет').toBe(0);
    expect(vi.mocked(toast.success).mock.calls.length).toBe(1);
  });

  it('успех — один success с именем действия', () => {
    notifyOperation(pull);
    expect(String(vi.mocked(toast.success).mock.calls[0]?.[0])).toMatch(/pull/i);
  });

  it('провал — один error с человеческим объяснением', () => {
    notifyOperationFailed(pull, { code: 'exec.pullDiverged', params: {} });
    const [title, options] = vi.mocked(toast.error).mock.calls[0] ?? [];
    expect(String(title)).toMatch(/pull failed/i);
    expect(String(options?.description ?? '')).toMatch(/diverged/i);
    expect(vi.mocked(toast.loading).mock.calls.length).toBe(0);
  });
});
