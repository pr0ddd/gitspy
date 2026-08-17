import { describe, expect, it } from 'vitest';
import { APPEARANCES, applyAppearance, knownAppearance } from '@/shared/config/appearance';

describe('appearance themes', () => {
  it('an unknown name falls back to the native theme instead of breaking the look', () => {
    expect(knownAppearance('dark')).toBe('dark');
    expect(knownAppearance('vaporwave')).toBe('');
  });

  it('applying a theme sets data-theme on the root and clears it again', () => {
    applyAppearance('midnight');
    expect(
      document.documentElement.dataset.theme,
      'canvas and CSS read the same tokens, so the switch has to live on the document root',
    ).toBe('midnight');
    applyAppearance('');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('the native theme comes first and is the only one with an empty key', () => {
    expect(APPEARANCES[0].key).toBe('');
    expect(APPEARANCES.filter((entry) => entry.key === '').length).toBe(1);
  });
});
