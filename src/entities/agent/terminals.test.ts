import { describe, expect, it } from 'vitest';
import { TERMINAL_REPLAY_LIMIT, onTerminalBytes, pushTerminalBytes } from './terminals';

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

const textOf = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('вывод терминалов агента', () => {
  it('панель догоняет напечатанное до неё и слышит напечатанное после', () => {
    pushTerminalBytes('t1', bytesOf('раз '));
    const seen: string[] = [];
    const stop = onTerminalBytes('t1', (bytes) => seen.push(textOf(bytes)));
    expect(
      seen.join(''),
      'карточка монтируется позже первых байтов, и без догона панель осталась бы пустой',
    ).toBe('раз ');
    pushTerminalBytes('t1', bytesOf('два'));
    expect(seen.join(''), 'дальнейший вывод идёт в живую панель').toBe('раз два');
    stop();
    pushTerminalBytes('t1', bytesOf('три'));
    expect(seen.join(''), 'снятая панель байтов больше не просит').toBe('раз два');
  });

  it('вывод разных терминалов не смешивается', () => {
    pushTerminalBytes('t2', bytesOf('своё'));
    pushTerminalBytes('t3', bytesOf('чужое'));
    const seen: string[] = [];
    onTerminalBytes('t2', (bytes) => seen.push(textOf(bytes)));
    expect(seen.join(''), 'у каждой команды агента своя панель').toBe('своё');
  });

  it('поток длиннее предела держит хвост, а не всю сессию в памяти', () => {
    const long = new Uint8Array(TERMINAL_REPLAY_LIMIT + 10).fill(0x61);
    pushTerminalBytes('t4', long);
    pushTerminalBytes('t4', bytesOf('хвост'));
    const seen: Uint8Array[] = [];
    onTerminalBytes('t4', (bytes) => seen.push(bytes));
    const replayed = seen[0];
    expect(
      replayed.length,
      'команда, печатающая гигабайты, не должна съедать память приложения',
    ).toBeLessThanOrEqual(TERMINAL_REPLAY_LIMIT);
    expect(
      textOf(replayed).endsWith('хвост'),
      'выброшено начало, а не конец: последнее напечатанное важнее всего',
    ).toBe(true);
  });
});
