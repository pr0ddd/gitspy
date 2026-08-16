import { describe, expect, it } from 'vitest';
import { activeOf, sessionsOfRepo, useTermSessions } from './sessions';

const fresh = () => {
  useTermSessions.setState({ sessions: [], activeByRepo: {} });
  return useTermSessions.getState();
};

describe('terminal session store', () => {
  it('add makes the session active', () => {
    fresh().add({ id: 1, title: 'zsh', command: null, cwd: '/r', repo: '/r' });
    expect(activeOf(useTermSessions.getState(), '/r')).toBe(1);
  });

  it('removing the active session switches to its neighbour', () => {
    const s = fresh();
    s.add({ id: 1, title: 'a', command: null, cwd: '/r', repo: '/r' });
    s.add({ id: 2, title: 'b', command: null, cwd: '/r', repo: '/r' });
    useTermSessions.getState().remove(2);
    expect(activeOf(useTermSessions.getState(), '/r')).toBe(1);
  });

  it('setTitle does not touch other sessions', () => {
    const s = fresh();
    s.add({ id: 1, title: 'a', command: null, cwd: '/r', repo: '/r' });
    s.add({ id: 2, title: 'b', command: null, cwd: '/r', repo: '/r' });
    useTermSessions.getState().setTitle(1, 'build');
    const [one, two] = useTermSessions.getState().sessions;
    expect(one.title).toBe('build');
    expect(two.title, 'the title reached only one session').toBe('b');
  });

  it('sessions of different repositories do not mix', () => {
    const s = fresh();
    s.add({ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a' });
    s.add({ id: 2, title: 'zsh', command: null, cwd: '/b', repo: '/b' });
    expect(sessionsOfRepo(useTermSessions.getState(), '/a').map((x) => x.id)).toEqual([1]);
    expect(sessionsOfRepo(useTermSessions.getState(), '/b').map((x) => x.id)).toEqual([2]);
  });

  it('each repository has its own active session', () => {
    const s = fresh();
    s.add({ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a' });
    s.add({ id: 2, title: 'zsh', command: null, cwd: '/b', repo: '/b' });
    expect(
      activeOf(useTermSessions.getState(), '/a'),
      'switching tabs does not steal the active session',
    ).toBe(1);
    expect(activeOf(useTermSessions.getState(), '/b')).toBe(2);
  });

  it('remove moves the active pointer only to a session of the same repository', () => {
    const s = fresh();
    s.add({ id: 1, title: 'a', command: null, cwd: '/a', repo: '/a' });
    s.add({ id: 2, title: 'b', command: null, cwd: '/b', repo: '/b' });
    useTermSessions.getState().remove(2);
    expect(
      activeOf(useTermSessions.getState(), '/b'),
      'no neighbour is looked for in another repository: the last one closed',
    ).toBeNull();
    expect(activeOf(useTermSessions.getState(), '/a')).toBe(1);
  });
});
