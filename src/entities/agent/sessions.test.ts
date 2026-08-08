import { describe, expect, it } from 'vitest';
import type { AcpConfigOptionView } from '@/types';
import { activeOf, agentsOfRepo, useAgentSessions } from './sessions';

const fresh = () => {
  useAgentSessions.setState({ sessions: [], activeByRepo: {} });
  return useAgentSessions.getState();
};

const MODEL: AcpConfigOptionView = {
  id: 'model',
  name: 'Model',
  description: null,
  category: 'model',
  currentValue: 'fable',
  choices: [
    { value: 'fable', name: 'Fable 5' },
    { value: 'opus', name: 'Opus 5' },
  ],
};

const MODE: AcpConfigOptionView = {
  id: 'mode',
  name: 'Mode',
  description: null,
  category: 'mode',
  currentValue: 'ask',
  choices: [{ value: 'ask', name: 'Ask' }],
};

describe('стор агентских сессий', () => {
  it('add кладёт сессию готовой к вводу', () => {
    fresh().add(1, '/r', 'claude · ACP');
    expect(useAgentSessions.getState().sessions, 'новая сессия ждёт первого промпта').toEqual([
      {
        id: 1,
        repo: '/r',
        title: 'claude · ACP',
        status: 'ready',
        config: [],
        commands: [],
        usage: null,
      },
    ]);
  });

  it('объявленные агентом опции ложатся в свою сессию', () => {
    const store = fresh();
    store.add(1, '/r', 'a');
    store.add(2, '/r', 'b');
    useAgentSessions.getState().setConfig(1, [MODEL, MODE]);
    const [one, two] = useAgentSessions.getState().sessions;
    expect(
      one.config.map((option) => option.id),
      'опции приходят по id сессии — у каждой свои',
    ).toEqual(['model', 'mode']);
    expect(two.config, 'соседняя сессия чужих опций не показывает').toEqual([]);
  });

  it('подтверждённое агентом значение меняет только названную опцию', () => {
    const store = fresh();
    store.add(1, '/r', 'a');
    useAgentSessions.getState().setConfig(1, [MODEL, MODE]);
    useAgentSessions.getState().setCurrentValue(1, 'model', 'opus');
    expect(
      useAgentSessions.getState().sessions[0].config.map((option) => option.currentValue),
      'смена модели не сбрасывает режим',
    ).toEqual(['opus', 'ask']);
  });

  it('расход окна контекста живёт у своей сессии', () => {
    const store = fresh();
    store.add(1, '/r', 'a');
    store.add(2, '/r', 'b');
    useAgentSessions.getState().setUsage(1, {
      used: 1200,
      size: 200000,
      cost: null,
      currency: null,
      limits: [{ kind: 'five_hour', resetsAt: 1786116000, usedShare: null, status: 'allowed' }],
    });
    const [one, two] = useAgentSessions.getState().sessions;
    expect(one.usage, 'расход берётся у агента как есть').toEqual({
      used: 1200,
      size: 200000,
      cost: null,
      currency: null,
      limits: [{ kind: 'five_hour', resetsAt: 1786116000, usedShare: null, status: 'allowed' }],
    });
    expect(two.usage, 'соседняя сессия своего расхода не получает').toBeNull();
  });

  it('setStatus и setTitle не трогают чужие сессии', () => {
    const store = fresh();
    store.add(1, '/r', 'a');
    store.add(2, '/r', 'b');
    useAgentSessions.getState().setStatus(1, 'waiting');
    useAgentSessions.getState().setTitle(1, 'правит demo.txt');
    const [one, two] = useAgentSessions.getState().sessions;
    expect([one.title, one.status], 'событие пришло по id — меняется только его сессия').toEqual([
      'правит demo.txt',
      'waiting',
    ]);
    expect([two.title, two.status], 'соседняя сессия своего состояния не теряет').toEqual([
      'b',
      'ready',
    ]);
  });

  it('remove убирает сессию, статусы чужих не трогаются', () => {
    const store = fresh();
    store.add(1, '/r', 'a');
    store.add(2, '/r', 'b');
    useAgentSessions.getState().setStatus(2, 'working');
    useAgentSessions.getState().remove(1);
    expect(
      useAgentSessions.getState().sessions,
      'закрытая сессия уходит, соседняя как была',
    ).toEqual([
      { id: 2, repo: '/r', title: 'b', status: 'working', config: [], commands: [], usage: null },
    ]);
  });

  it('порядок сессий — порядок их появления', () => {
    const store = fresh();
    store.add(1, '/r', 'a');
    store.add(2, '/r', 'b');
    store.add(3, '/r', 'c');
    expect(
      useAgentSessions.getState().sessions.map((session) => session.id),
      'список дока не переставляет сессии сам по себе',
    ).toEqual([1, 2, 3]);
  });

  it('сессии разных репозиториев не смешиваются', () => {
    const s = fresh();
    s.add(1, '/a', 'claude · ACP');
    s.add(2, '/b', 'claude · ACP');
    expect(agentsOfRepo(useAgentSessions.getState(), '/a').map((x) => x.id)).toEqual([1]);
    expect(agentsOfRepo(useAgentSessions.getState(), '/b').map((x) => x.id)).toEqual([2]);
  });

  it('активная сессия своя у каждого репозитория', () => {
    const s = fresh();
    s.add(1, '/a', 'claude · ACP');
    s.add(2, '/b', 'claude · ACP');
    expect(
      activeOf(useAgentSessions.getState(), '/a'),
      'переключение вкладки не крадёт активную сессию',
    ).toBe(1);
    expect(activeOf(useAgentSessions.getState(), '/b')).toBe(2);
  });

  it('уход на терминал снимает активность только у своего репозитория', () => {
    const s = fresh();
    s.add(1, '/a', 'claude · ACP');
    s.add(2, '/b', 'claude · ACP');
    useAgentSessions.getState().setActive('/a', null);
    expect(
      activeOf(useAgentSessions.getState(), '/a'),
      'выбранный терминал убирает ленту со сцены своего репозитория',
    ).toBeNull();
    expect(activeOf(useAgentSessions.getState(), '/b')).toBe(2);
  });
});
