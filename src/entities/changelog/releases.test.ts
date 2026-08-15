import { describe, expect, it } from 'vitest';
import { notesFor, parseReleases } from '../../../scripts/changelog.mjs';
import { RELEASES } from './releases';

const FILE = `# Changelog

Preamble that belongs to no version.

## Unreleased

- something not shipped yet

## 1.0.6 — 2026-08-14

- one thing
- another thing

## 1.0.5 — 2026-08-07

- older thing
`;

describe('разбор changelog', () => {
  it('делит файл на секции и не считает преамбулу версией', () => {
    const releases = parseReleases(FILE);
    expect(
      releases.map((release) => release.version),
      'версии идут сверху вниз, текст до первого заголовка ничей',
    ).toEqual(['Unreleased', '1.0.6', '1.0.5']);
  });

  it('тело секции — всё до следующего заголовка, без пустых краёв', () => {
    const [, latest] = parseReleases(FILE);
    expect(latest.body, 'тело уходит в Prose как есть, лишние пустые строки там мусор').toBe(
      '- one thing\n- another thing',
    );
    expect(latest.date, 'дата рядом с версией — признак выпущенной секции').toBe('2026-08-14');
  });

  it('заголовок не по форме роняет разбор, а не молча теряет версию', () => {
    expect(
      () => parseReleases('## 1.0.6 (2026-08-14)\n\n- thing\n'),
      'потерянная секция вышла бы пустым релизом на экране и в GitHub',
    ).toThrow(/## <version>/);
  });
});

describe('заметки релиза', () => {
  it('отдаёт тело версии и снимает префикс v', () => {
    expect(notesFor(FILE, 'v1.0.6')).toBe('- one thing\n- another thing');
  });

  it('валится на невыпущенной и на отсутствующей секции', () => {
    expect(
      () => notesFor(FILE, '1.0.7'),
      'тег без секции — релиз без заметок, ловим до сборки',
    ).toThrow();
    expect(
      () => notesFor(FILE, 'Unreleased'),
      'секция без даты не выпущена и заметками быть не может',
    ).toThrow();
  });
});

describe('CHANGELOG.md проекта', () => {
  it('описывает установленную версию', () => {
    const current = RELEASES.find((release) => release.version === __APP_VERSION__);
    expect(current?.body, `версия ${__APP_VERSION__} обязана иметь непустую секцию`).toBeTruthy();
  });

  it('показывает только выпущенное', () => {
    expect(
      RELEASES.every((release) => release.date !== null),
      'Unreleased — черновик для нас, пользователю его показывать нечестно',
    ).toBe(true);
  });
});
