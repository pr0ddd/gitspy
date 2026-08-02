import { describe, expect, it } from 'vitest';
import { toHex } from './colour';

const HEX = /^#[0-9a-f]{6}$/;

describe('цвет темы редактора', () => {
  it('всегда шесть знаков', () => {
    expect(toHex(0, 0, 0)).toBe('#000000');
    expect(toHex(255, 255, 255)).toBe('#ffffff');
    expect(toHex(30, 144, 255)).toBe('#1e90ff');
    expect(toHex(1, 0, 265)).toMatch(HEX);
  });

  it('канал за границей диапазона не удлиняет строку', () => {
    expect(toHex(300, -20, 1000)).toBe('#ff00ff');
  });

  it('разбор строки oklch давал бы семь знаков — так делать нельзя', () => {
    const parts = 'oklch(0.92 0.006 265)'.match(/[\d.]+/g) ?? [];
    const broken =
      '#' + parts.map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');
    expect(broken).toBe('#0100109');
    expect(broken).not.toMatch(HEX);
  });
});
