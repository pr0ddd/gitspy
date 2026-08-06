import { describe, expect, it } from 'vitest';
import { hostBotOf, hostOf } from '@/host';
import type { RemoteView } from '@/types';

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

describe('бот хостинга по почте коммита', () => {
  it('веб-интерфейсы хостингов узнаются по своим noreply-адресам', () => {
    expect(hostBotOf('noreply@github.com')).toBe('github');
    expect(hostBotOf('noreply@gitlab.com')).toBe('gitlab');
    expect(hostBotOf('commits-noreply@bitbucket.org')).toBe('bitbucket');
  });

  it('боты github вроде actions и dependabot тоже узнаются', () => {
    expect(hostBotOf('41898282+github-actions[bot]@users.noreply.github.com')).toBe('github');
    expect(hostBotOf('49699333+dependabot[bot]@users.noreply.github.com')).toBe('github');
  });

  it('личная noreply-почта человека ботом не считается', () => {
    expect(
      hostBotOf('1234567+pr0d@users.noreply.github.com'),
      'приватная почта пользователя github — человек, ему положен его аватар',
    ).toBeNull();
    expect(hostBotOf('ada@example.com')).toBeNull();
  });
});
