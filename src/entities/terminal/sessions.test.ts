import { describe, expect, it } from 'vitest';
import { activeOf, sessionsOfRepo, useTermSessions } from './sessions';

const fresh = () => {
  useTermSessions.setState({ sessions: [], activeByRepo: {} });
  return useTermSessions.getState();
};

describe('стор сессий терминала', () => {
  it('add делает сессию активной', () => {
    fresh().add({ id: 1, title: 'zsh', command: null, cwd: '/r', repo: '/r', status: 'idle' });
    expect(activeOf(useTermSessions.getState(), '/r')).toBe(1);
  });

  it('remove активной переключает на соседнюю', () => {
    const s = fresh();
    s.add({ id: 1, title: 'a', command: null, cwd: '/r', repo: '/r', status: 'idle' });
    s.add({ id: 2, title: 'b', command: null, cwd: '/r', repo: '/r', status: 'idle' });
    useTermSessions.getState().remove(2);
    expect(activeOf(useTermSessions.getState(), '/r')).toBe(1);
  });

  it('setTitle и setStatus не трогают чужие сессии', () => {
    const s = fresh();
    s.add({ id: 1, title: 'a', command: null, cwd: '/r', repo: '/r', status: 'idle' });
    s.add({ id: 2, title: 'b', command: null, cwd: '/r', repo: '/r', status: 'idle' });
    useTermSessions.getState().setTitle(1, 'сборка');
    useTermSessions.getState().setStatus(1, 'failed');
    const [one, two] = useTermSessions.getState().sessions;
    expect([one.title, one.status]).toEqual(['сборка', 'failed']);
    expect([two.title, two.status]).toEqual(['b', 'idle']);
  });

  it('setCwd переносит в сессию каталог, о котором сообщил шелл', () => {
    const s = fresh();
    s.add({ id: 1, title: 'a', command: null, cwd: '/r', repo: '/r', status: 'idle' });
    useTermSessions.getState().setCwd(1, '/r/crates/gitspy-term');
    expect(
      useTermSessions.getState().sessions[0].cwd,
      'каталог сессии идёт из OSC 7, а не остаётся тем, с которого начали',
    ).toBe('/r/crates/gitspy-term');
  });

  it('сессии разных репозиториев не смешиваются', () => {
    const s = fresh();
    s.add({ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a', status: 'idle' });
    s.add({ id: 2, title: 'zsh', command: null, cwd: '/b', repo: '/b', status: 'idle' });
    expect(sessionsOfRepo(useTermSessions.getState(), '/a').map((x) => x.id)).toEqual([1]);
    expect(sessionsOfRepo(useTermSessions.getState(), '/b').map((x) => x.id)).toEqual([2]);
  });

  it('активная сессия своя у каждого репозитория', () => {
    const s = fresh();
    s.add({ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a', status: 'idle' });
    s.add({ id: 2, title: 'zsh', command: null, cwd: '/b', repo: '/b', status: 'idle' });
    expect(
      activeOf(useTermSessions.getState(), '/a'),
      'переключение вкладки не крадёт активную сессию',
    ).toBe(1);
    expect(activeOf(useTermSessions.getState(), '/b')).toBe(2);
  });

  it('remove уводит активную только к сессии своего репозитория', () => {
    const s = fresh();
    s.add({ id: 1, title: 'a', command: null, cwd: '/a', repo: '/a', status: 'idle' });
    s.add({ id: 2, title: 'b', command: null, cwd: '/b', repo: '/b', status: 'idle' });
    useTermSessions.getState().remove(2);
    expect(
      activeOf(useTermSessions.getState(), '/b'),
      'соседа в чужом репозитории не ищут — закрылась последняя',
    ).toBeNull();
    expect(activeOf(useTermSessions.getState(), '/a')).toBe(1);
  });
});
