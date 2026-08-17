import { describe, expect, it } from 'vitest';
import { hostBotOf, hostLabelOf, hostOf, hostOfUrl } from '@/entities/repo';
import type { RemoteView } from '@/shared/api/types';

const remote = (webUrl: string | null): RemoteView => ({ name: 'origin', avatarUrl: null, webUrl });

describe('host detection from a remote', () => {
  it('github, gitlab and bitbucket are recognised by their URL', () => {
    expect(hostOf([remote('https://github.com/pr0d/gitspy')])).toBe('github');
    expect(hostOf([remote('https://gitlab.com/pr0d/gitspy')])).toBe('gitlab');
    expect(hostOf([remote('https://bitbucket.org/pr0d/gitspy')])).toBe('bitbucket');
  });

  it('a repository with no remote or with an unknown host is left without a badge', () => {
    expect(hostOf([])).toBeNull();
    expect(hostOf([remote(null)])).toBeNull();
    expect(hostOf([remote('https://git.example.com/x')])).toBeNull();
  });

  it('the host comes from the first remote that is recognised', () => {
    expect(hostOf([remote(null), remote('https://github.com/x/y')])).toBe('github');
  });

  it('a bare web URL is enough, so a menu built from a link can name the host it opens', () => {
    expect(hostOfUrl('https://gitlab.com/pr0d/gitspy')).toBe('gitlab');
    expect(hostOfUrl('https://git.example.com/x')).toBeNull();
  });
});

describe('naming a host', () => {
  it('the three known hosts get their own spelling', () => {
    expect(hostLabelOf('github')).toBe('GitHub');
    expect(hostLabelOf('gitlab')).toBe('GitLab');
    expect(hostLabelOf('bitbucket')).toBe('Bitbucket');
  });

  it('an unknown connection is named by its own id rather than by a guessed host', () => {
    expect(hostLabelOf('gitlab.corp.dev')).toBe('gitlab.corp.dev');
  });
});

describe('host bot detection from the commit email', () => {
  it('the web interfaces of the hosts are recognised by their noreply addresses', () => {
    expect(hostBotOf('noreply@github.com')).toBe('github');
    expect(hostBotOf('noreply@gitlab.com')).toBe('gitlab');
    expect(hostBotOf('commits-noreply@bitbucket.org')).toBe('bitbucket');
  });

  it('github bots such as actions and dependabot are recognised too', () => {
    expect(hostBotOf('41898282+github-actions[bot]@users.noreply.github.com')).toBe('github');
    expect(hostBotOf('49699333+dependabot[bot]@users.noreply.github.com')).toBe('github');
  });

  it('a personal noreply address is not counted as a bot', () => {
    expect(
      hostBotOf('1234567+pr0d@users.noreply.github.com'),
      'a private github user address belongs to a person, and a person gets their own avatar',
    ).toBeNull();
    expect(hostBotOf('ada@example.com')).toBeNull();
  });
});
