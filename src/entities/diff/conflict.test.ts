import { describe, expect, it } from 'vitest';
import { viewForEntry } from './conflict';

describe('маршрут строки файла', () => {
  it('конфликтная строка ведёт в резолв, обычная — в дифф', () => {
    expect(viewForEntry('U', false)).toBe('conflict');
    expect(viewForEntry('M', false)).toBe('diff');
    expect(viewForEntry('A', true)).toBe('diff');
  });

  it('застейдженная строка идёт в дифф даже с буквой U', () => {
    expect(
      viewForEntry('U', true),
      'после git add stage-стороны :2/:3 пусты — резолву нечего показать',
    ).toBe('diff');
  });
});
