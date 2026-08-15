import { beforeEach, describe, expect, it } from 'vitest';
import { readProfiles, writeProfiles } from './profiles';

describe('профили терминала', () => {
  beforeEach(() => localStorage.clear());

  it('без сохранённых профилей есть логин-шелл', () => {
    expect(readProfiles(), 'новая вкладка открывается без всякой настройки').toEqual([
      { label: 'zsh', command: null },
    ]);
  });

  it('сохранённые профили возвращаются как есть', () => {
    writeProfiles([{ label: 'dev', command: 'npm run app' }]);
    expect(readProfiles()).toEqual([{ label: 'dev', command: 'npm run app' }]);
  });
});
