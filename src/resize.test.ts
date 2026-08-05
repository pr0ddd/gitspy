import { describe, expect, it } from 'vitest';
import { clampPanel, PANEL_LIMITS } from './resize';

describe('пределы ширины панелей', () => {
  it('ширина внутри пределов проходит как есть', () => {
    expect(clampPanel('sidebar', 300)).toBe(300);
    expect(clampPanel('details', 400)).toBe(400);
  });

  it('за пределами ширина упирается в край, а не пружинит', () => {
    expect(clampPanel('sidebar', 50)).toBe(PANEL_LIMITS.sidebar.min);
    expect(clampPanel('sidebar', 9000)).toBe(PANEL_LIMITS.sidebar.max);
    expect(clampPanel('details', 0)).toBe(PANEL_LIMITS.details.min);
    expect(clampPanel('details', 9000)).toBe(PANEL_LIMITS.details.max);
  });

  it('мусор из хранилища превращается в ширину по умолчанию', () => {
    expect(clampPanel('sidebar', Number.NaN)).toBe(PANEL_LIMITS.sidebar.fallback);
    expect(clampPanel('details', Number.NaN)).toBe(PANEL_LIMITS.details.fallback);
  });
});
