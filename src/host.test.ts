import { describe, expect, it } from 'vitest';
import { hostOf } from './host';
import type { RemoteView } from './types';

const remote = (webUrl: string | null): RemoteView => ({ name: 'origin', avatarUrl: null, webUrl });

describe('определение хостинга по remote', () => {
  it('github, gitlab и bitbucket узнаются по адресу', () => {
    expect(hostOf([remote('https://github.com/pr0d/gitspy')])).toBe('github');
    expect(hostOf([remote('https://gitlab.com/pr0d/gitspy')])).toBe('gitlab');
    expect(hostOf([remote('https://bitbucket.org/pr0d/gitspy')])).toBe('bitbucket');
  });

  it('репозиторий без remote или с неизвестным хостом остаётся без значка', () => {
    expect(hostOf([])).toBeNull();
    expect(hostOf([remote(null)])).toBeNull();
    expect(hostOf([remote('https://git.example.com/x')])).toBeNull();
  });

  it('хост берётся у первого remote, который узнан', () => {
    expect(hostOf([remote(null), remote('https://github.com/x/y')])).toBe('github');
  });
});
