import { describe, expect, it } from 'vitest';
import {
  AUTOFETCH_LIMITS,
  clampAutofetch,
  clampFontSize,
  clampTabSize,
  FONT_SIZE_LIMITS,
  monospaceChoices,
} from '@/settingsModel';

describe('интервал автофетча', () => {
  it('значение в пределах проходит как есть, ноль — это выключено', () => {
    expect(clampAutofetch(5)).toBe(5);
    expect(clampAutofetch(0)).toBe(0);
  });

  it('за пределами прижимается к краю, мусор — к умолчанию', () => {
    expect(clampAutofetch(-3)).toBe(AUTOFETCH_LIMITS.min);
    expect(clampAutofetch(999)).toBe(AUTOFETCH_LIMITS.max);
    expect(clampAutofetch(Number.NaN)).toBe(AUTOFETCH_LIMITS.fallback);
  });
});

describe('настройки редактора', () => {
  it('кегль и таб прижимаются к пределам, мусор — к умолчанию', () => {
    expect(clampFontSize(13)).toBe(13);
    expect(clampFontSize(4)).toBe(FONT_SIZE_LIMITS.min);
    expect(clampFontSize(Number.NaN)).toBe(FONT_SIZE_LIMITS.fallback);
    expect(clampTabSize(2)).toBe(2);
    expect(clampTabSize(99)).toBe(8);
  });

  it('в списке шрифтов только реально установленные', () => {
    const found = monospaceChoices((family) => family === 'Menlo' || family === 'Hack');
    expect(found, 'выпадашка не предлагает шрифт, которого нет на машине').toEqual([
      'Menlo',
      'Hack',
    ]);
  });
});
