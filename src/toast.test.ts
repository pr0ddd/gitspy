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

describe('жизнь тоста операции', () => {
  beforeEach(() => {
    vi.mocked(toast.loading).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('провал гасит спиннер операции, а не оставляет его крутиться рядом с ошибкой', () => {
    notifyOperation(pull, 'started');
    notifyOperationFailed(pull, { code: 'exec.pullDiverged', params: {} });
    const loadingId = vi.mocked(toast.loading).mock.calls[0]?.[1]?.id;
    const [, errorOptions] = vi.mocked(toast.error).mock.calls[0] ?? [];
    expect(loadingId, 'loading-тост обязан иметь id, иначе его не заменить').toBeTruthy();
    expect(
      errorOptions?.id,
      'тост ошибки обязан заменить loading-тост по тому же id',
    ).toBe(loadingId);
  });

  it('провал push с установкой upstream гасит тот же спиннер, что и обычный push', () => {
    const push: Operation = { kind: 'pushSetUpstream', remote: 'origin', branch: 'master' };
    notifyOperation(push, 'started');
    notifyOperationFailed(push, { code: 'exec.rejected', params: {} });
    expect(vi.mocked(toast.error).mock.calls[0]?.[1]?.id).toBe(
      vi.mocked(toast.loading).mock.calls[0]?.[1]?.id,
    );
  });

  it('текст ошибки — человеческая фраза по коду, а не только «git failed»', () => {
    notifyOperationFailed(pull, { code: 'exec.pullDiverged', params: {} });
    const [title, options] = vi.mocked(toast.error).mock.calls[0] ?? [];
    expect(String(title), 'заголовок называет операцию').toMatch(/pull failed/i);
    expect(
      String(options?.description ?? ''),
      'описание объясняет расхождение веток словами, а не кодом',
    ).toMatch(/diverged/i);
  });
});
