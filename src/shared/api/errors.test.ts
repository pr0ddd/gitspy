import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { describeError, isNotOpen } from '@/shared/api/errors';

const echo = ((key: string) => key) as unknown as TFunction<'errors'>;

describe('git error detail', () => {
  it('a wall of hint lines is squeezed down to the lines that carry the point', () => {
    const detail =
      'hint: You have divergent branches and need to specify how to reconcile them.\n' +
      'hint: git config pull.rebase false  # merge\n' +
      'hint: git config pull.rebase true   # rebase\n' +
      'fatal: Need to specify how to reconcile divergent branches.';
    expect(
      describeError({ code: 'exec.failed', params: {}, detail }, echo).detail,
      'hint: lines are advice for the terminal, and in a toast they are noise',
    ).toBe('fatal: Need to specify how to reconcile divergent branches.');
  });

  it('a detail made of nothing but hint lines does not collapse into emptiness', () => {
    const detail = 'hint: Updates were rejected because the remote contains work';
    expect(
      describeError({ code: 'exec.failed', params: {}, detail }, echo).detail,
      'a raw hint is better than an error with no detail at all',
    ).toBe(detail);
  });
});

describe('state drift against the backend', () => {
  it('a not-open repository is recognised so the app reopens it instead of showing an error', () => {
    expect(isNotOpen({ code: 'repo.notOpen', params: { path: '/r' } })).toBe(true);
  });

  it('every other error stays an error', () => {
    expect(isNotOpen({ code: 'exec.failed', params: {} })).toBe(false);
    expect(isNotOpen(new Error('anything at all'))).toBe(false);
    expect(isNotOpen(null)).toBe(false);
  });
});
