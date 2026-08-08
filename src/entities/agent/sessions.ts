import { create } from 'zustand';
import type { AcpCommandView, AcpConfigOptionView, AcpRateLimitView } from '@/types';
import type { AgentStatus } from './feed';

export type AgentUsage = {
  used: number;
  size: number;
  cost: number | null;
  currency: string | null;
  limits: AcpRateLimitView[];
};

export type AgentSession = {
  id: number;
  repo: string;
  title: string;
  status: AgentStatus;
  config: AcpConfigOptionView[];
  commands: AcpCommandView[];
  usage: AgentUsage | null;
};

type AgentState = {
  sessions: AgentSession[];
  activeByRepo: Record<string, number | null>;
  add(id: number, repo: string, title: string): void;
  setStatus(id: number, status: AgentStatus): void;
  setTitle(id: number, title: string): void;
  setConfig(id: number, config: AcpConfigOptionView[]): void;
  setCurrentValue(id: number, configId: string, value: string): void;
  setCommands(id: number, commands: AcpCommandView[]): void;
  setUsage(id: number, usage: AgentUsage): void;
  remove(id: number): void;
  setActive(repo: string, id: number | null): void;
};

export const agentsOfRepo = (state: Pick<AgentState, 'sessions'>, repo: string): AgentSession[] =>
  state.sessions.filter((session) => session.repo === repo);

export const activeOf = (state: Pick<AgentState, 'activeByRepo'>, repo: string): number | null =>
  state.activeByRepo[repo] ?? null;

const neighbourInSameRepo = (sessions: AgentSession[], leaving: AgentSession): number | null => {
  const kin = sessions.filter((session) => session.repo === leaving.repo);
  const at = kin.findIndex((session) => session.id === leaving.id);
  const kept = kin[at - 1] ?? kin[at + 1];
  return kept ? kept.id : null;
};

const changeOnlySession =
  (id: number, change: Partial<AgentSession>) =>
  (state: AgentState): Partial<AgentState> => ({
    sessions: state.sessions.map((session) =>
      session.id === id ? { ...session, ...change } : session,
    ),
  });

const withValueOfNamedOption = (
  config: AcpConfigOptionView[],
  configId: string,
  value: string,
): AcpConfigOptionView[] =>
  config.map((option) => (option.id === configId ? { ...option, currentValue: value } : option));

export const useAgentSessions = create<AgentState>()((set) => ({
  sessions: [],
  activeByRepo: {},
  add: (id, repo, title) =>
    set((state) => ({
      sessions: [
        ...state.sessions,
        { id, repo, title, status: 'ready', config: [], commands: [], usage: null },
      ],
      activeByRepo: { ...state.activeByRepo, [repo]: id },
    })),
  setStatus: (id, status) => set(changeOnlySession(id, { status })),
  setTitle: (id, title) => set(changeOnlySession(id, { title })),
  setConfig: (id, config) => set(changeOnlySession(id, { config })),
  setCurrentValue: (id, configId, value) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === id
          ? { ...session, config: withValueOfNamedOption(session.config, configId, value) }
          : session,
      ),
    })),
  setCommands: (id, commands) => set(changeOnlySession(id, { commands })),
  setUsage: (id, usage) => set(changeOnlySession(id, { usage })),
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
  setActive: (repo, id) =>
    set((state) => ({ activeByRepo: { ...state.activeByRepo, [repo]: id } })),
}));
