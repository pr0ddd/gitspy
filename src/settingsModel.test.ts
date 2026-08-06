import { describe, expect, it } from 'vitest';
import { AUTOFETCH_LIMITS, clampAutofetch } from '@/settingsModel';

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
