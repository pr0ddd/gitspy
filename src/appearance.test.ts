import { describe, expect, it } from 'vitest';
import { APPEARANCES, applyAppearance, knownAppearance } from '@/appearance';

describe('темы оформления', () => {
  it('неизвестное имя откатывается к родной теме, а не ломает вид', () => {
    expect(knownAppearance('linear-dark')).toBe('linear-dark');
    expect(knownAppearance('vaporwave')).toBe('');
  });

  it('применение ставит и снимает data-theme на корне', () => {
    applyAppearance('magic-blue');
    expect(
      document.documentElement.dataset.theme,
      'canvas и CSS читают одни токены — переключение обязано жить на корне документа',
    ).toBe('magic-blue');
    applyAppearance('');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('родная тема первая в списке и единственная с пустым ключом', () => {
    expect(APPEARANCES[0].key).toBe('');
    expect(APPEARANCES.filter((entry) => entry.key === '').length).toBe(1);
  });
});
