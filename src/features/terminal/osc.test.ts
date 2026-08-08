import { describe, expect, it } from 'vitest';
import { parseOsc133, parseOsc7 } from './osc';

describe('разбор OSC', () => {
  it('133;D;1 — команда завершилась с ошибкой', () => {
    expect(parseOsc133('D;1')).toEqual({ phase: 'D', exit: 1 });
  });

  it('133;A — начало приглашения без кода', () => {
    expect(parseOsc133('A')).toEqual({ phase: 'A' });
  });

  it('мусор не роняет разбор', () => {
    expect(parseOsc133('Z;;')).toBeNull();
  });

  it('OSC 7 отдаёт путь из file-URL', () => {
    expect(parseOsc7('file://mac.local/Users/x/projects/gitspy')).toBe('/Users/x/projects/gitspy');
  });
});
