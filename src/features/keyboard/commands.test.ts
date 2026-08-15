import { describe, expect, it } from 'vitest';
import type { Stroke } from '@/keys';
import { COMMANDS, commandFor } from './commands';

const stroke = (key: string, held: Partial<Stroke> = {}): Stroke => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...held,
});

describe('какая команда достаётся нажатию', () => {
  it('буква без модификатора работает только в своей области', () => {
    expect(commandFor(stroke('s'), 'files', true)?.id).toBe('stageCurrent');
    expect(commandFor(stroke('s'), 'graph', true)).toBe(null);
  });

  it('в поле ввода буквы печатаются, а не выполняют команды', () => {
    expect(commandFor(stroke('s'), 'text', true)).toBe(null);
    expect(commandFor(stroke('j'), 'text', true)).toBe(null);
  });

  it('в поле ввода аккорд с модификатором всё же доходит: им и коммитят', () => {
    expect(commandFor(stroke('Enter', { metaKey: true }), 'text', true)?.id).toBe('commit');
  });

  it('стрелка водит выбор в любой области', () => {
    expect(commandFor(stroke('ArrowDown'), 'files', true)?.id).toBe('selectNext');
    expect(commandFor(stroke('ArrowDown'), 'graph', true)?.id).toBe('selectNext');
    expect(commandFor(stroke('ArrowDown'), 'refs', true)?.id).toBe('selectNext');
  });

  it('j и k делают то же, что стрелки', () => {
    expect(commandFor(stroke('j'), 'files', true)?.id).toBe('selectNext');
    expect(commandFor(stroke('k'), 'files', true)?.id).toBe('selectPrevious');
  });

  it('одна и та же команда приходит с Command на макбуке и с Ctrl на прочих', () => {
    expect(commandFor(stroke('/', { metaKey: true }), null, true)?.id).toBe('shortcuts');
    expect(commandFor(stroke('/', { ctrlKey: true }), null, false)?.id).toBe('shortcuts');
  });

  it('без области командам без привязки нажатие всё равно достаётся', () => {
    expect(commandFor(stroke('Escape'), null, true)?.id).toBe('closeView');
  });

  it('масштаб слушает оба написания плюса и минуса', () => {
    expect(commandFor(stroke('=', { metaKey: true }), null, true)?.id).toBe('zoomIn');
    expect(commandFor(stroke('+', { metaKey: true, shiftKey: true }), null, true)?.id).toBe('zoomIn');
    expect(commandFor(stroke('-', { metaKey: true }), null, true)?.id).toBe('zoomOut');
    expect(commandFor(stroke('_', { metaKey: true, shiftKey: true }), null, true)?.id).toBe('zoomOut');
    expect(commandFor(stroke('0', { metaKey: true }), null, true)?.id).toBe('zoomReset');
  });

  it('буква без модификатора не крадёт сочетание с Command', () => {
    expect(commandFor(stroke('a', { metaKey: true }), 'files', true)).toBe(null);
  });
});

describe('реестр как источник справки', () => {
  it('идентификаторы не повторяются, иначе обработчик перекроет чужой', () => {
    const ids = COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('у каждой команды есть ключ словаря и хотя бы один аккорд', () => {
    for (const command of COMMANDS) {
      expect(command.label.startsWith('shortcuts.'), command.id).toBe(true);
      expect(command.chords.length, command.id).toBeGreaterThan(0);
    }
  });

  it('два аккорда без модификатора в одной области не сталкиваются', () => {
    const seen = new Map<string, string>();
    for (const command of COMMANDS) {
      for (const chord of command.chords) {
        const key = `${command.area ?? 'app'}:${chord.primary ? 'p' : ''}${chord.shift ? 's' : ''}${chord.alt ? 'a' : ''}${chord.key.toLowerCase()}`;
        expect(seen.get(key), `${key} уже занят командой ${seen.get(key)}`).toBe(undefined);
        seen.set(key, command.id);
      }
    }
  });
});
