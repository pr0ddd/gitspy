import { describe, expect, it } from 'vitest';
import { applePlatform, chordKeys, chordLabel, keyLabel, matchesChord, type Stroke } from '@/keys';

const stroke = (key: string, held: Partial<Stroke> = {}): Stroke => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...held,
});

describe('главный модификатор зависит от системы', () => {
  it('один аккорд ловит и Command на макбуке, и Ctrl на остальных', () => {
    const chord = { key: 's', primary: true };
    expect(matchesChord(chord, stroke('s', { metaKey: true }), true)).toBe(true);
    expect(matchesChord(chord, stroke('s', { ctrlKey: true }), false)).toBe(true);
  });

  it('Ctrl на макбуке не заменяет Command, иначе Ctrl+C ушёл бы в команду', () => {
    expect(matchesChord({ key: 's', primary: true }, stroke('s', { ctrlKey: true }), true)).toBe(
      false,
    );
  });

  it('Command на Windows не заменяет Ctrl', () => {
    expect(matchesChord({ key: 's', primary: true }, stroke('s', { metaKey: true }), false)).toBe(
      false,
    );
  });

  it('аккорд без модификатора не срабатывает под модификатором', () => {
    expect(matchesChord({ key: 's' }, stroke('s', { metaKey: true }), true)).toBe(false);
  });
});

describe('строгость по Shift и Alt', () => {
  it('аккорд без Shift не ловит нажатие с Shift', () => {
    expect(
      matchesChord(
        { key: 's', primary: true },
        stroke('S', { metaKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(false);
  });

  it('регистр буквы не важен: под Shift браузер отдаёт заглавную', () => {
    expect(
      matchesChord(
        { key: 's', primary: true, shift: true },
        stroke('S', { metaKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(true);
  });

  it('у символа Shift не проверяется, потому что символ им и набран', () => {
    expect(
      matchesChord(
        { key: '/', primary: true },
        stroke('/', { metaKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(true);
  });

  it('Alt проверяется строго и на символах тоже', () => {
    expect(
      matchesChord({ key: '/', primary: true }, stroke('/', { metaKey: true, altKey: true }), true),
    ).toBe(false);
  });
});

describe('подпись аккорда', () => {
  it('на макбуке знаки, на остальных слова', () => {
    expect(chordKeys({ key: 'Enter', primary: true }, true)).toEqual(['⌘', '↩']);
    expect(chordKeys({ key: 'Enter', primary: true }, false)).toEqual(['Ctrl', 'Enter']);
  });

  it('модификаторы идут в постоянном порядке', () => {
    expect(chordKeys({ key: 's', primary: true, shift: true }, true)).toEqual(['⌘', '⇧', 'S']);
  });

  it('стрелки и Escape показываются знаком и коротким словом', () => {
    expect(keyLabel('ArrowDown', true)).toBe('↓');
    expect(keyLabel('Escape', false)).toBe('Esc');
  });

  it('на не-макбуке части разделены плюсом, как принято в Windows', () => {
    expect(chordLabel({ key: 'l', primary: true }, false)).toBe('Ctrl + L');
    expect(chordLabel({ key: 'l', primary: true }, true)).toBe('⌘ L');
  });
});

describe('определение системы', () => {
  it('макбук узнаётся по строке webview', () => {
    expect(applePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true);
    expect(applePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(applePlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
  });
});

describe('раскладка клавиатуры', () => {
  it('буква узнаётся по физической клавише: на русской раскладке S даёт «ы», но это та же клавиша', () => {
    expect(matchesChord({ key: 's' }, { ...stroke('ы'), code: 'KeyS' }, true)).toBe(true);
    expect(matchesChord({ key: 'u' }, { ...stroke('г'), code: 'KeyU' }, true)).toBe(true);
  });

  it('символы и служебные клавиши по-прежнему узнаются по key: у стрелок и Enter кода буквы нет', () => {
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

  it('другая клавиша с той же буквой в чужой раскладке не срабатывает: код решает', () => {
    expect(matchesChord({ key: 's' }, { ...stroke('s'), code: 'KeyD' }, true)).toBe(false);
  });
});
