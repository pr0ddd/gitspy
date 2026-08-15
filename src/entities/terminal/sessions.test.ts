import { describe, expect, it } from 'vitest';
import { activeOf, sessionsOfRepo, useTermSessions } from './sessions';

const fresh = () => {
  useTermSessions.setState({ sessions: [], activeByRepo: {} });
  return useTermSessions.getState();
};

describe('стор сессий терминала', () => {
  it('add делает сессию активной', () => {
    fresh().add({ id: 1, title: 'zsh', command: null, cwd: '/r', repo: '/r' });
    expect(activeOf(useTermSessions.getState(), '/r')).toBe(1);
  });

  it('remove активной переключает на соседнюю', () => {
    const s = fresh();
    s.add({ id: 1, title: 'a', command: null, cwd: '/r', repo: '/r' });
    s.add({ id: 2, title: 'b', command: null, cwd: '/r', repo: '/r' });
    useTermSessions.getState().remove(2);
    expect(activeOf(useTermSessions.getState(), '/r')).toBe(1);
  });

  it('setTitle не трогает чужие сессии', () => {
    const s = fresh();
    s.add({ id: 1, title: 'a', command: null, cwd: '/r', repo: '/r' });
    s.add({ id: 2, title: 'b', command: null, cwd: '/r', repo: '/r' });
    useTermSessions.getState().setTitle(1, 'сборка');
    const [one, two] = useTermSessions.getState().sessions;
    expect(one.title).toBe('сборка');
    expect(two.title, 'заголовок пришёл только одной сессии').toBe('b');
  });

  it('сессии разных репозиториев не смешиваются', () => {
    const s = fresh();
    s.add({ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a' });
    s.add({ id: 2, title: 'zsh', command: null, cwd: '/b', repo: '/b' });
    expect(sessionsOfRepo(useTermSessions.getState(), '/a').map((x) => x.id)).toEqual([1]);
    expect(sessionsOfRepo(useTermSessions.getState(), '/b').map((x) => x.id)).toEqual([2]);
  });

  it('активная сессия своя у каждого репозитория', () => {
    const s = fresh();
    s.add({ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a' });
    s.add({ id: 2, title: 'zsh', command: null, cwd: '/b', repo: '/b' });
    expect(
      activeOf(useTermSessions.getState(), '/a'),
      'переключение вкладки не крадёт активную сессию',
    ).toBe(1);
    expect(activeOf(useTermSessions.getState(), '/b')).toBe(2);
  });

  it('remove уводит активную только к сессии своего репозитория', () => {
    const s = fresh();
    s.add({ id: 1, title: 'a', command: null, cwd: '/a', repo: '/a' });
    s.add({ id: 2, title: 'b', command: null, cwd: '/b', repo: '/b' });
    useTermSessions.getState().remove(2);
    expect(
      activeOf(useTermSessions.getState(), '/b'),
      'соседа в чужом репозитории не ищут — закрылась последняя',
    ).toBeNull();
    expect(activeOf(useTermSessions.getState(), '/a')).toBe(1);
  });
});
