import { describe, expect, it } from 'vitest';
import { clampSelected, EMPTY, sessionsReducer } from './session';
import type { RepoView } from './types';

describe('выделение после перечитывания истории', () => {
  it('выделение за пределами истории подтягивается к последней строке', () => {
    expect(clampSelected(500, 100)).toBe(99);
  });

  it('обычное выделение не трогается', () => {
    expect(clampSelected(7, 100)).toBe(7);
  });

  it('в пустом репозитории выделение остаётся нулевым, а не отрицательным', () => {
    expect(clampSelected(3, 0)).toBe(0);
  });
});

const repo = (count: number): RepoView => ({
  path: '/r',
  count,
  maxLane: 0,
  head: null,
  truncated: false,
  readMs: 1,
  layoutMs: 1,
  minimap: [],
  minimapColours: [],
  remotes: [],
  refs: [],
});

describe('переходы состояния сессий', () => {
  it('повторное открытие не плодит вкладку, а активирует существующую', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'open', path: '/b' });
    state = sessionsReducer(state, { kind: 'open', path: '/a' });

    expect(state.sessions.map((s) => s.path)).toEqual(['/a', '/b']);
    expect(state.active).toBe('/a');
  });

  it('закрытие активной вкладки выбирает соседнюю, а не пустоту', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'open', path: '/b' });
    state = sessionsReducer(state, { kind: 'close', path: '/b' });

    expect(state.active).toBe('/a');
    expect(state.sessions).toHaveLength(1);
  });

  it('закрытие неактивной не трогает активную', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'open', path: '/b' });
    state = sessionsReducer(state, { kind: 'close', path: '/a' });

    expect(state.active).toBe('/b');
  });

  it('история стала короче — выделение подтягивается, а не указывает в пустоту', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'select', path: '/a', index: 500 });
    state = sessionsReducer(state, { kind: 'loaded', path: '/a', repo: repo(100) });

    expect(state.sessions[0].selected).toBe(99);
    expect(state.sessions[0].loading).toBe(false);
  });

  it('провал загрузки убирает сессию целиком', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'failed', path: '/a' });

    expect(state.sessions).toHaveLength(0);
    expect(state.active).toBeNull();
  });

  it('загрузка чужой вкладки не трогает мою', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'open', path: '/b' });
    const before = state.sessions.find((s) => s.path === '/a')!;
    state = sessionsReducer(state, { kind: 'loaded', path: '/b', repo: repo(5) });

    expect(state.sessions.find((s) => s.path === '/a')).toBe(before);
  });
});
