import { create } from 'zustand';

export type TermStatus = 'running' | 'failed' | 'idle' | 'exited';

export type TermSession = {
  id: number;
  title: string;
  command: string | null;
  cwd: string;
  repo: string;
  status: TermStatus;
};

type TermState = {
  sessions: TermSession[];
  activeByRepo: Record<string, number | null>;
  add(session: TermSession): void;
  remove(id: number): void;
  setTitle(id: number, title: string): void;
  setStatus(id: number, status: TermStatus): void;
  setCwd(id: number, cwd: string): void;
  setActive(repo: string, id: number | null): void;
};

export const sessionsOfRepo = (state: Pick<TermState, 'sessions'>, repo: string): TermSession[] =>
  state.sessions.filter((session) => session.repo === repo);

export const activeOf = (state: Pick<TermState, 'activeByRepo'>, repo: string): number | null =>
  state.activeByRepo[repo] ?? null;

const neighbourInSameRepo = (sessions: TermSession[], leaving: TermSession): number | null => {
  const kin = sessions.filter((session) => session.repo === leaving.repo);
  const at = kin.findIndex((session) => session.id === leaving.id);
  const kept = kin[at - 1] ?? kin[at + 1];
  return kept ? kept.id : null;
};

const changeOnlySession =
  (id: number, change: Partial<TermSession>) =>
  (state: TermState): Partial<TermState> => ({
    sessions: state.sessions.map((session) =>
      session.id === id ? { ...session, ...change } : session,
    ),
  });

export const useTermSessions = create<TermState>()((set) => ({
  sessions: [],
  activeByRepo: {},
  add: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeByRepo: { ...state.activeByRepo, [session.repo]: session.id },
    })),
  remove: (id) =>
    set((state) => {
      const leaving = state.sessions.find((session) => session.id === id);
      if (!leaving) return {};
      const sessions = state.sessions.filter((session) => session.id !== id);
      if (state.activeByRepo[leaving.repo] !== id) return { sessions };
      return {
        sessions,
        activeByRepo: {
          ...state.activeByRepo,
          [leaving.repo]: neighbourInSameRepo(state.sessions, leaving),
        },
      };
    }),
  setTitle: (id, title) => set(changeOnlySession(id, { title })),
  setStatus: (id, status) => set(changeOnlySession(id, { status })),
  setCwd: (id, cwd) => set(changeOnlySession(id, { cwd })),
  setActive: (repo, id) =>
    set((state) => ({ activeByRepo: { ...state.activeByRepo, [repo]: id } })),
}));
