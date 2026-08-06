import { describe, expect, it } from 'vitest';
import { relativeTime } from '@/time';

const NOW = 1_800_000_000;

describe('относительное время для списков', () => {
  it('минуты, часы и дни называются словами человека', () => {
    expect(relativeTime(NOW - 35 * 60, NOW, 'en')).toBe('35 minutes ago');
    expect(relativeTime(NOW - 3 * 3600, NOW, 'en')).toBe('3 hours ago');
    expect(relativeTime(NOW - 2 * 86400, NOW, 'en')).toBe('2 days ago');
  });

  it('свежий коммит — сейчас, а не ноль секунд', () => {
    expect(relativeTime(NOW, NOW, 'en')).toBe('now');
  });

  it('старое уходит в месяцы и годы, а не в тысячи дней', () => {
    expect(relativeTime(NOW - 40 * 86400, NOW, 'en')).toBe('last month');
    expect(relativeTime(NOW - 800 * 86400, NOW, 'en')).toBe('2 years ago');
  });
});
