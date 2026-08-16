import { describe, expect, it } from 'vitest';
import { toHex } from '@/colour';

const HEX = /^#[0-9a-f]{6}$/;

describe('editor theme colour', () => {
  it('always six hex digits', () => {
    expect(toHex(0, 0, 0)).toBe('#000000');
    expect(toHex(255, 255, 255)).toBe('#ffffff');
    expect(toHex(30, 144, 255)).toBe('#1e90ff');
    expect(toHex(1, 0, 265)).toMatch(HEX);
  });

  it('a channel out of range does not make the string longer', () => {
    expect(toHex(300, -20, 1000)).toBe('#ff00ff');
  });

  it('parsing an oklch string would yield seven digits, which is why it must not be done', () => {
    const parts = 'oklch(0.92 0.006 265)'.match(/[\d.]+/g) ?? [];
    const broken =
      '#' + parts.map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');
    expect(broken).toBe('#0100109');
    expect(broken).not.toMatch(HEX);
  });
});
