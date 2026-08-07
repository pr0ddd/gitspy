import { describe, expect, it, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import i18next from '@/i18n';
import { notifyOperation, notifyOperationFailed } from '@/toast';
import type { Operation } from '@/types';

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

const EVERY_KIND: Record<Operation['kind'], null> = {
  writeCommitGraph: null,
  fetchDryRun: null,
  fetch: null,
  pull: null,
  pullFfOnly: null,
  pullRebase: null,
  push: null,
  pushSetUpstream: null,
  checkout: null,
  checkoutTracking: null,
  branch: null,
  branchAt: null,
  branchDelete: null,
  branchRename: null,
  amendMessage: null,
  merge: null,
  mergeAbort: null,
  mergeContinue: null,
  rebase: null,
  cherryPick: null,
  revert: null,
  drop: null,
  reset: null,
  tagAt: null,
  annotatedTagAt: null,
  worktreeAdd: null,
  fetchInto: null,
  pushBranch: null,
  pushDelete: null,
  stash: null,
  stashPop: null,
  stashFile: null,
  discardAll: null,
};

describe('тосты — только исход действия, словами человека', () => {
  beforeEach(() => {
    vi.mocked(toast.loading).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('запуск не рождает ни одного тоста — индикатор живёт у кнопки', () => {
    notifyOperation({ kind: 'pull' });
    expect(vi.mocked(toast.loading).mock.calls.length, 'спиннер-тостов больше нет').toBe(0);
    expect(vi.mocked(toast.success).mock.calls.length).toBe(1);
  });

  it('исход назван фразой, а не склейкой «branch finished»', () => {
    notifyOperation({ kind: 'branch', name: 'wip', checkout: false });
    expect(String(vi.mocked(toast.success).mock.calls[0]?.[0])).toBe('Branch created');
  });

  it('у каждой операции закрытого списка есть фразы исхода и провала', () => {
    for (const kind of Object.keys(EVERY_KIND)) {
      expect(i18next.exists(`toast.done.${kind}`), `нет toast.done.${kind}`).toBe(true);
      expect(i18next.exists(`toast.fail.${kind}`), `нет toast.fail.${kind}`).toBe(true);
    }
  });

  it('локальный fast-forward не называется fetch', () => {
    notifyOperation({ kind: 'fetchInto', remote: '.', from: 'origin/main', into: 'main' });
    expect(String(vi.mocked(toast.success).mock.calls[0]?.[0])).toMatch(/fast-forward/i);
  });

  it('провал — error с человеческим заголовком и объяснением', () => {
    notifyOperationFailed({ kind: 'pull' }, { code: 'exec.pullDiverged', params: {} });
    const [title, options] = vi.mocked(toast.error).mock.calls[0] ?? [];
    expect(String(title)).toBe('Pull failed');
    expect(String(options?.description ?? '')).toMatch(/diverged/i);
  });
});
