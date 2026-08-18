import { afterEach, describe, expect, it, vi } from 'vitest';
import { laneColourAlpha, refreshTheme } from './theme';

describe('lane tints', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('are resolved through the style engine once per lane and percent, not once per chip per frame', () => {
    laneColourAlpha(3, 28);
    const spy = vi.spyOn(window, 'getComputedStyle');

    laneColourAlpha(3, 28);
    laneColourAlpha(3, 28);
    laneColourAlpha(15, 28);
    expect(
      spy,
      'the same lane and tint again cost nothing; lane 15 is lane 3 of the palette',
    ).toHaveBeenCalledTimes(0);

    laneColourAlpha(3, 45);
    expect(spy, 'a different tint is a new colour').toHaveBeenCalledTimes(1);
  });

  it('forget what they resolved when the theme is rebuilt, since the palette may have changed', () => {
    laneColourAlpha(2, 28);
    refreshTheme();
    const spy = vi.spyOn(window, 'getComputedStyle');
    laneColourAlpha(2, 28);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
