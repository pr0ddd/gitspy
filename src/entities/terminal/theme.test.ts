import { describe, expect, it } from 'vitest';
import { readTermTheme } from './theme';

describe('тема терминала из токенов', () => {
  it('каждый цвет приходит из переменной, а не из кода', () => {
    const asked: string[] = [];
    const theme = readTermTheme((name) => {
      asked.push(name);
      return `resolved(${name})`;
    });
    expect(theme.background).toBe('resolved(--card)');
    expect(theme.red).toBe('resolved(--term-ansi-1)');
    expect(theme.brightWhite).toBe('resolved(--term-ansi-15)');
    expect(asked).toContain('--term-selection');
  });
});
