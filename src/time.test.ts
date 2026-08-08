import { describe, expect, it } from 'vitest';
import { relativeTime, timeUntil } from '@/time';

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

describe('время до срока', () => {
  it('срок называется вперёд, а не задним числом', () => {
    expect(timeUntil(NOW + 35 * 60, NOW, 'en'), 'лимит сбросится через 35 минут').toBe(
      'in 35 minutes',
    );
    expect(timeUntil(NOW + 3 * 3600, NOW, 'en'), 'до сброса три часа').toBe('in 3 hours');
  });

  it('прошедший срок не уезжает в будущее', () => {
    expect(
      timeUntil(NOW - 3600, NOW, 'en'),
      'сброс уже случился, а агент ещё не прислал новое окно — врать про час впереди нельзя',
    ).toBe('now');
  });
});
