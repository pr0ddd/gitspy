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

describe('which command a keystroke resolves to', () => {
  it('fires a bare letter only inside its own area', () => {
    expect(commandFor(stroke('s'), 'files', true)?.id).toBe('stageCurrent');
    expect(commandFor(stroke('s'), 'graph', true)).toBe(null);
  });

  it('lets letters type into a text field instead of running commands', () => {
    expect(commandFor(stroke('s'), 'text', true)).toBe(null);
    expect(commandFor(stroke('j'), 'text', true)).toBe(null);
  });

  it('still delivers a modifier chord inside a text field: that is how you commit', () => {
    expect(commandFor(stroke('Enter', { metaKey: true }), 'text', true)?.id).toBe('commit');
  });

  it('moves the selection with an arrow in every area', () => {
    expect(commandFor(stroke('ArrowDown'), 'files', true)?.id).toBe('selectNext');
    expect(commandFor(stroke('ArrowDown'), 'graph', true)?.id).toBe('selectNext');
    expect(commandFor(stroke('ArrowDown'), 'refs', true)?.id).toBe('selectNext');
  });

  it('treats j and k the same as the arrows', () => {
    expect(commandFor(stroke('j'), 'files', true)?.id).toBe('selectNext');
    expect(commandFor(stroke('k'), 'files', true)?.id).toBe('selectPrevious');
  });

  it('delivers the same command with Command on a Mac and with Ctrl everywhere else', () => {
    expect(commandFor(stroke('/', { metaKey: true }), null, true)?.id).toBe('shortcuts');
    expect(commandFor(stroke('/', { ctrlKey: true }), null, false)?.id).toBe('shortcuts');
  });

  it('still delivers the keystroke to area-less commands when no area holds the focus', () => {
    expect(commandFor(stroke('Escape'), null, true)?.id).toBe('closeView');
  });

  it('listens to both spellings of plus and minus for zoom', () => {
    expect(commandFor(stroke('=', { metaKey: true }), null, true)?.id).toBe('zoomIn');
    expect(commandFor(stroke('+', { metaKey: true, shiftKey: true }), null, true)?.id).toBe(
      'zoomIn',
    );
    expect(commandFor(stroke('-', { metaKey: true }), null, true)?.id).toBe('zoomOut');
    expect(commandFor(stroke('_', { metaKey: true, shiftKey: true }), null, true)?.id).toBe(
      'zoomOut',
    );
    expect(commandFor(stroke('0', { metaKey: true }), null, true)?.id).toBe('zoomReset');
  });

  it('does not let a bare letter steal the chord that holds Command', () => {
    expect(commandFor(stroke('a', { metaKey: true }), 'files', true)).toBe(null);
  });
});

describe('the command registry as the source of the shortcuts help', () => {
  it('keeps ids unique, otherwise one handler would shadow another', () => {
    const ids = COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every command an i18n key and at least one chord', () => {
    for (const command of COMMANDS) {
      expect(command.label.startsWith('shortcuts.'), command.id).toBe(true);
      expect(command.chords.length, command.id).toBeGreaterThan(0);
    }
  });

  it('keeps two chords in the same area from colliding', () => {
    const seen = new Map<string, string>();
    for (const command of COMMANDS) {
      for (const chord of command.chords) {
        const key = `${command.area ?? 'app'}:${chord.primary ? 'p' : ''}${chord.shift ? 's' : ''}${chord.alt ? 'a' : ''}${chord.key.toLowerCase()}`;
        expect(seen.get(key), `${key} is already taken by command ${seen.get(key)}`).toBe(
          undefined,
        );
        seen.set(key, command.id);
      }
    }
  });
});
