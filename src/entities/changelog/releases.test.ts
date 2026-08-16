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

describe('changelog parsing', () => {
  it('splits the file into sections and does not take the preamble for a version', () => {
    const releases = parseReleases(FILE);
    expect(
      releases.map((release) => release.version),
      'versions come in file order, the text before the first heading belongs to none of them',
    ).toEqual(['Unreleased', '1.0.6', '1.0.5']);
  });

  it('takes the body up to the next heading, without the blank edges', () => {
    const [, latest] = parseReleases(FILE);
    expect(
      latest.body,
      'the body goes into Prose as is, and stray blank lines are litter there',
    ).toBe('- one thing\n- another thing');
    expect(latest.date, 'a date next to the version is what marks the section as released').toBe(
      '2026-08-14',
    );
  });

  it('fails the parse on a malformed heading instead of silently losing the version', () => {
    expect(
      () => parseReleases('## 1.0.6 (2026-08-14)\n\n- thing\n'),
      'a lost section would show up as an empty release both on screen and on GitHub',
    ).toThrow(/## <version>/);
  });
});

describe('release notes', () => {
  it('returns the body of the version and strips the v prefix', () => {
    expect(notesFor(FILE, 'v1.0.6')).toBe('- one thing\n- another thing');
  });

  it('throws for an unreleased section and for a missing one', () => {
    expect(
      () => notesFor(FILE, '1.0.7'),
      'a tag with no section is a release with no notes, and we catch that before the build',
    ).toThrow();
    expect(
      () => notesFor(FILE, 'Unreleased'),
      'a section without a date is not released and cannot serve as release notes',
    ).toThrow();
  });
});

describe("the project's CHANGELOG.md", () => {
  it('describes the version that is installed', () => {
    const current = RELEASES.find((release) => release.version === __APP_VERSION__);
    expect(current?.body, `version ${__APP_VERSION__} must have a non-empty section`).toBeTruthy();
  });

  it('shows only what has been released', () => {
    expect(
      RELEASES.every((release) => release.date !== null),
      'Unreleased is a draft for us, and showing it to the user would be dishonest',
    ).toBe(true);
  });
});
