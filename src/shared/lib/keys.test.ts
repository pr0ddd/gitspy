import { describe, expect, it } from 'vitest';
import {
  applePlatform,
  chordKeys,
  chordLabel,
  keyLabel,
  matchesChord,
  type Stroke,
} from '@/shared/lib/keys';

const stroke = (key: string, held: Partial<Stroke> = {}): Stroke => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...held,
});

describe('the primary modifier depends on the platform', () => {
  it('a single chord catches Command on a Mac and Ctrl everywhere else', () => {
    const chord = { key: 's', primary: true };
    expect(matchesChord(chord, stroke('s', { metaKey: true }), true)).toBe(true);
    expect(matchesChord(chord, stroke('s', { ctrlKey: true }), false)).toBe(true);
  });

  it('Ctrl on a Mac does not stand in for Command, otherwise Ctrl+C would fire the command', () => {
    expect(matchesChord({ key: 's', primary: true }, stroke('s', { ctrlKey: true }), true)).toBe(
      false,
    );
  });

  it('Command on Windows does not stand in for Ctrl', () => {
    expect(matchesChord({ key: 's', primary: true }, stroke('s', { metaKey: true }), false)).toBe(
      false,
    );
  });

  it('a chord without a modifier does not fire while a modifier is held', () => {
    expect(matchesChord({ key: 's' }, stroke('s', { metaKey: true }), true)).toBe(false);
  });
});

describe('strictness about Shift and Alt', () => {
  it('a chord without Shift does not catch a stroke with Shift held', () => {
    expect(
      matchesChord(
        { key: 's', primary: true },
        stroke('S', { metaKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(false);
  });

  it('letter case does not matter: under Shift the browser reports the uppercase letter', () => {
    expect(
      matchesChord(
        { key: 's', primary: true, shift: true },
        stroke('S', { metaKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(true);
  });

  it('Shift is not checked for a symbol, because the symbol is typed with it', () => {
    expect(
      matchesChord(
        { key: '/', primary: true },
        stroke('/', { metaKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(true);
  });

  it('Alt is checked strictly, on symbols as well', () => {
    expect(
      matchesChord({ key: '/', primary: true }, stroke('/', { metaKey: true, altKey: true }), true),
    ).toBe(false);
  });
});

describe('chord label', () => {
  it('glyphs on a Mac, words everywhere else', () => {
    expect(chordKeys({ key: 'Enter', primary: true }, true)).toEqual(['⌘', '↩']);
    expect(chordKeys({ key: 'Enter', primary: true }, false)).toEqual(['Ctrl', 'Enter']);
  });

  it('modifiers always come in the same order', () => {
    expect(chordKeys({ key: 's', primary: true, shift: true }, true)).toEqual(['⌘', '⇧', 'S']);
  });

  it('arrows and Escape are shown as a glyph and a short word', () => {
    expect(keyLabel('ArrowDown', true)).toBe('↓');
    expect(keyLabel('Escape', false)).toBe('Esc');
  });

  it('off a Mac the parts are joined by a plus, the way Windows writes them', () => {
    expect(chordLabel({ key: 'l', primary: true }, false)).toBe('Ctrl + L');
    expect(chordLabel({ key: 'l', primary: true }, true)).toBe('⌘ L');
  });
});

describe('platform detection', () => {
  it('a Mac is recognised from the webview user agent string', () => {
    expect(applePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true);
    expect(applePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(applePlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
  });
});

describe('keyboard layout', () => {
  it('a letter is matched by the physical key: on a Greek layout KeyS types σ, yet it is the same key', () => {
    expect(matchesChord({ key: 's' }, { ...stroke('σ'), code: 'KeyS' }, true)).toBe(true);
    expect(matchesChord({ key: 'u' }, { ...stroke('θ'), code: 'KeyU' }, true)).toBe(true);
  });

  it('symbols and named keys are still matched by key: arrows and Enter carry no letter code', () => {
    expect(
      matchesChord({ key: 'ArrowDown' }, { ...stroke('ArrowDown'), code: 'ArrowDown' }, true),
    ).toBe(true);
    expect(
      matchesChord(
        { key: '\\', primary: true },
        { ...stroke('\\', { metaKey: true }), code: 'Backslash' },
        true,
      ),
    ).toBe(true);
  });

  it('another key carrying the same letter in a foreign layout does not fire: the code decides', () => {
    expect(matchesChord({ key: 's' }, { ...stroke('s'), code: 'KeyD' }, true)).toBe(false);
  });
});
