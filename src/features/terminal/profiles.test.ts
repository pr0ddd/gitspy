import { beforeEach, describe, expect, it } from 'vitest';
import { writePref } from '@/prefs';
import { readProfiles, writeProfiles } from './profiles';

describe('профили терминала', () => {
  beforeEach(() => localStorage.clear());

  it('без сохранённых профилей есть логин-шелл и агент', () => {
    expect(readProfiles(), 'агентская сессия заводится профилем, а не отдельным пунктом').toEqual([
      { label: 'zsh', command: null, kind: 'term' },
      { label: 'claude · ACP', command: null, kind: 'acp' },
    ]);
  });

  it('сохранённые профили возвращаются как есть', () => {
    writeProfiles([{ label: 'dev', command: 'npm run app', kind: 'term' }]);
    expect(readProfiles()).toEqual([{ label: 'dev', command: 'npm run app', kind: 'term' }]);
  });

  it('профиль агента отличается от терминального своим видом', () => {
    writeProfiles([{ label: 'claude · ACP', command: null, kind: 'acp' }]);
    expect(readProfiles()[0].kind, 'по виду профиля док решает, что запускать').toBe('acp');
  });

  it('профиль, сохранённый до появления видов, считается терминальным', () => {
    writePref('term.profiles', [{ label: 'dev', command: 'make' }]);
    expect(readProfiles(), 'старая настройка не должна превращаться в агентскую сессию').toEqual([
      { label: 'dev', command: 'make', kind: 'term' },
    ]);
  });
});
