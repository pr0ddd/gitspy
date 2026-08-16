import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settledOrGiveUp } from './repoLoading';

describe('avatar warm-up before the first paint', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives up at the limit: a slow avatar cache must not delay showing the repository', async () => {
    let released = false;
    void settledOrGiveUp(new Promise(() => {}), 400).then(() => (released = true));

    await vi.advanceTimersByTimeAsync(399);
    expect(released, 'before the limit the wait is still on').toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(released, 'at the limit the wait ends even though the cache never answered').toBe(true);
  });

  it('returns as soon as the work settles, and a failed warm-up is not an error for the caller', async () => {
    let released = false;
    void settledOrGiveUp(Promise.reject(new Error('offline')), 400).then(() => (released = true));

    await vi.advanceTimersByTimeAsync(0);
    expect(released, 'rejection releases the wait immediately').toBe(true);
    expect(vi.getTimerCount(), 'the limit timer is cleared, nothing is left ticking').toBe(0);
  });
});
