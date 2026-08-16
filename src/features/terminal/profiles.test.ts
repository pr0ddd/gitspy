import { beforeEach, describe, expect, it } from 'vitest';
import { readProfiles, writeProfiles } from './profiles';

describe('terminal profiles', () => {
  beforeEach(() => localStorage.clear());

  it('offers the login shell when nothing has been saved', () => {
    expect(readProfiles(), 'a new tab opens without any setup at all').toEqual([
      { label: 'zsh', command: null },
    ]);
  });

  it('returns saved profiles as they were written', () => {
    writeProfiles([{ label: 'dev', command: 'npm run app' }]);
    expect(readProfiles()).toEqual([{ label: 'dev', command: 'npm run app' }]);
  });
});
