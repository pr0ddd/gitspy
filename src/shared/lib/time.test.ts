import { describe, expect, it } from 'vitest';
import { relativeTime, timeUntil } from '@/shared/lib/time';

const NOW = 1_800_000_000;

describe('relative time for lists', () => {
  it('names minutes, hours and days in words a person would use', () => {
    expect(relativeTime(NOW - 35 * 60, NOW, 'en')).toBe('35 minutes ago');
    expect(relativeTime(NOW - 3 * 3600, NOW, 'en')).toBe('3 hours ago');
    expect(relativeTime(NOW - 2 * 86400, NOW, 'en')).toBe('2 days ago');
  });

  it('calls a fresh commit now, not zero seconds ago', () => {
    expect(relativeTime(NOW, NOW, 'en')).toBe('now');
  });

  it('rolls old times up into months and years instead of thousands of days', () => {
    expect(relativeTime(NOW - 40 * 86400, NOW, 'en')).toBe('last month');
    expect(relativeTime(NOW - 800 * 86400, NOW, 'en')).toBe('2 years ago');
  });
});

describe('time until a deadline', () => {
  it('names a deadline as time ahead, not time past', () => {
    expect(timeUntil(NOW + 35 * 60, NOW, 'en'), 'the limit resets in 35 minutes').toBe(
      'in 35 minutes',
    );
    expect(timeUntil(NOW + 3 * 3600, NOW, 'en'), 'three hours left until the reset').toBe(
      'in 3 hours',
    );
  });

  it('does not push a deadline that already passed into the future', () => {
    expect(
      timeUntil(NOW - 3600, NOW, 'en'),
      'the reset already happened and the agent has not sent a new window yet — claiming an hour ahead would be a lie',
    ).toBe('now');
  });
});
