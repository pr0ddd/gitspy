import { describe, expect, it } from 'vitest';
import {
  AUTOFETCH_LIMITS,
  clampAutofetch,
  clampFontSize,
  clampTabSize,
  FONT_SIZE_LIMITS,
  monospaceChoices,
} from '@/settingsModel';

describe('autofetch interval', () => {
  it('passes a value inside the limits through untouched, and zero means off', () => {
    expect(clampAutofetch(5)).toBe(5);
    expect(clampAutofetch(0)).toBe(0);
  });

  it('clamps a value outside the limits to the nearest edge and junk to the default', () => {
    expect(clampAutofetch(-3)).toBe(AUTOFETCH_LIMITS.min);
    expect(clampAutofetch(999)).toBe(AUTOFETCH_LIMITS.max);
    expect(clampAutofetch(Number.NaN)).toBe(AUTOFETCH_LIMITS.fallback);
  });
});

describe('editor settings', () => {
  it('clamps font size and tab size to their limits and junk to the default', () => {
    expect(clampFontSize(13)).toBe(13);
    expect(clampFontSize(4)).toBe(FONT_SIZE_LIMITS.min);
    expect(clampFontSize(Number.NaN)).toBe(FONT_SIZE_LIMITS.fallback);
    expect(clampTabSize(2)).toBe(2);
    expect(clampTabSize(99)).toBe(8);
  });

  it('lists only the fonts actually installed', () => {
    const found = monospaceChoices((family) => family === 'Menlo' || family === 'Hack');
    expect(found, 'the dropdown never offers a font this machine does not have').toEqual([
      'Menlo',
      'Hack',
    ]);
  });
});
