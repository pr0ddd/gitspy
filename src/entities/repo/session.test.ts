import { describe, expect, it } from 'vitest';
import { clampSelected, EMPTY, sessionsReducer } from './session';
import type { RepoView } from '@/shared/api/types';

describe('selection after the history is re-read', () => {
  it('a selection past the end of the history is pulled back to the last row', () => {
    expect(clampSelected(500, 100)).toBe(99);
  });

  it('a selection inside the history is left alone', () => {
    expect(clampSelected(7, 100)).toBe(7);
  });

  it('in an empty repository the selection stays at zero instead of going negative', () => {
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

describe('session state transitions', () => {
  it('opening the same path again activates the existing tab instead of adding a second one', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'open', path: '/b' });
    state = sessionsReducer(state, { kind: 'open', path: '/a' });

    expect(state.sessions.map((s) => s.path)).toEqual(['/a', '/b']);
    expect(state.active).toBe('/a');
  });

  it('closing the active tab activates its neighbour instead of leaving nothing active', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'open', path: '/b' });
    state = sessionsReducer(state, { kind: 'close', path: '/b' });

    expect(state.active).toBe('/a');
    expect(state.sessions).toHaveLength(1);
  });

  it('closing an inactive tab leaves the active one alone', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'open', path: '/b' });
    state = sessionsReducer(state, { kind: 'close', path: '/a' });

    expect(state.active).toBe('/b');
  });

  it('when the history got shorter the selection is pulled in instead of pointing past the end', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'select', path: '/a', index: 500 });
    state = sessionsReducer(state, { kind: 'loaded', path: '/a', repo: repo(100) });

    expect(state.sessions[0].selected).toBe(99);
    expect(state.sessions[0].loading).toBe(false);
  });

  it('a failed load removes the session entirely', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'failed', path: '/a' });

    expect(state.sessions).toHaveLength(0);
    expect(state.active).toBeNull();
  });

  it('a load that finished for another tab leaves this one untouched', () => {
    let state = sessionsReducer(EMPTY, { kind: 'open', path: '/a' });
    state = sessionsReducer(state, { kind: 'open', path: '/b' });
    const before = state.sessions.find((s) => s.path === '/a')!;
    state = sessionsReducer(state, { kind: 'loaded', path: '/b', repo: repo(5) });

    expect(state.sessions.find((s) => s.path === '/a')).toBe(before);
  });
});

describe('selecting the same row again', () => {
  it('returns the previous state, so pressing Enter twice in a row redraws nothing', () => {
    const opened = sessionsReducer(EMPTY, { kind: 'open', path: '/r' });
    const chosen = sessionsReducer(opened, { kind: 'select', path: '/r', index: 5 });

    expect(sessionsReducer(chosen, { kind: 'select', path: '/r', index: 5 })).toBe(chosen);
  });

  it('a different row does change the state', () => {
    const opened = sessionsReducer(EMPTY, { kind: 'open', path: '/r' });
    const chosen = sessionsReducer(opened, { kind: 'select', path: '/r', index: 5 });
    const moved = sessionsReducer(chosen, { kind: 'select', path: '/r', index: 6 });

    expect(moved).not.toBe(chosen);
    expect(moved.sessions[0].selected).toBe(6);
  });
});
