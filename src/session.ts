import type { RefView, RepoView, WorktreeView } from './types';

export type Session = {
  path: string;
  name: string;
  repo: RepoView | null;
  refsByCommit: Map<number, RefView[]>;
  worktrees: WorktreeView[];
  selected: number;
  loading: boolean;
};

export const clampSelected = (selected: number, count: number): number => {
  if (count <= 0) return 0;
  return Math.min(Math.max(0, selected), count - 1);
};

export const repoName = (path: string): string =>
  path
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop() || path;

export const newSession = (path: string): Session => ({
  path,
  name: repoName(path),
  repo: null,
  refsByCommit: new Map(),
  worktrees: [],
  selected: 0,
  loading: true,
});

export const groupRefsByCommit = (refs: RefView[]): Map<number, RefView[]> => {
  const byCommit = new Map<number, RefView[]>();
  for (const ref of refs) {
    const list = byCommit.get(ref.commit);
    if (list) list.push(ref);
    else byCommit.set(ref.commit, [ref]);
  }
  return byCommit;
};

export type SessionsState = {
  readonly sessions: Session[];
  readonly active: string | null;
};

export const EMPTY: SessionsState = { sessions: [], active: null };

export type SessionsAction =
  | { kind: 'open'; path: string }
  | { kind: 'close'; path: string }
  | { kind: 'activate'; path: string | null }
  | { kind: 'loaded'; path: string; repo: RepoView }
  | { kind: 'failed'; path: string }
  | { kind: 'select'; path: string; index: number }
  | { kind: 'worktrees'; path: string; worktrees: WorktreeView[] };

const patched = (
  state: SessionsState,
  path: string,
  change: (session: Session) => Session,
): SessionsState => ({
  ...state,
  sessions: state.sessions.map((s) => (s.path === path ? change(s) : s)),
});

const without = (state: SessionsState, path: string): SessionsState => {
  const rest = state.sessions.filter((s) => s.path !== path);
  return {
    sessions: rest,
    active: state.active === path ? (rest[rest.length - 1]?.path ?? null) : state.active,
  };
};

export function sessionsReducer(state: SessionsState, action: SessionsAction): SessionsState {
  switch (action.kind) {
    case 'open': {
      const known = state.sessions.some((s) => s.path === action.path);
      return {
        sessions: known ? state.sessions : [...state.sessions, newSession(action.path)],
        active: action.path,
      };
    }
    case 'close':
      return without(state, action.path);
    case 'activate':
      return { ...state, active: action.path };
    case 'loaded':
      return patched(state, action.path, (s) => ({
        ...s,
        repo: action.repo,
        refsByCommit: groupRefsByCommit(action.repo.refs),
        loading: false,
        selected: clampSelected(s.selected, action.repo.count),
      }));
    case 'failed':
      return without(state, action.path);
    case 'select':
      return patched(state, action.path, (s) => ({ ...s, selected: action.index }));
    case 'worktrees':
      return patched(state, action.path, (s) => ({ ...s, worktrees: action.worktrees }));
  }
}
