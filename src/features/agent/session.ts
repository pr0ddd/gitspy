import {
  activeOf,
  agentsOfRepo,
  applyEvent,
  draftOf,
  pushTerminalBytes,
  resolvePermission,
  setDraft,
  statusAfter,
  useAgentSessions,
  withMentionAppended,
} from '@/entities/agent';
import type { AgentStatus, FeedItem } from '@/entities/agent';
import { acpCancel, acpOpen, acpPermission, acpPrompt, acpRollback, acpSetConfig } from '@/ipc';
import { writePref } from '@/prefs';
import type { AcpEventView } from '@/types';

const ACP_TITLE = 'claude · ACP';

const reasonOf = (failure: unknown): string =>
  failure instanceof Error ? failure.message : JSON.stringify(failure);

const EMPTY_FEED: FeedItem[] = [];

const feeds = new Map<number, FeedItem[]>();
const watchers = new Map<number, Set<() => void>>();

export const feedOf = (id: number): FeedItem[] => feeds.get(id) ?? EMPTY_FEED;

export const onFeed = (id: number, changed: () => void): (() => void) => {
  const watching = watchers.get(id) ?? new Set<() => void>();
  watching.add(changed);
  watchers.set(id, watching);
  return () => {
    watching.delete(changed);
    if (watching.size === 0) watchers.delete(id);
  };
};

const putFeed = (id: number, items: FeedItem[]): void => {
  feeds.set(id, items);
  watchers.get(id)?.forEach((changed) => changed());
};

const rememberWhatAgentControls = (id: number, event: AcpEventView): void => {
  const sessions = useAgentSessions.getState();
  if (event.kind === 'config') sessions.setConfig(id, event.options);
  if (event.kind === 'configValue') sessions.setCurrentValue(id, event.configId, event.value);
  if (event.kind === 'commands') sessions.setCommands(id, event.commands);
  if (event.kind === 'usage')
    sessions.setUsage(id, {
      used: event.used,
      size: event.size,
      cost: event.cost,
      currency: event.currency,
      limits: event.limits,
    });
};

const statusOfSession = (id: number): AgentStatus | undefined =>
  useAgentSessions.getState().sessions.find((session) => session.id === id)?.status;

const stopStaysPressedUntilTurnEnds = (id: number, event: AcpEventView): AgentStatus | null => {
  const next = statusAfter(event);
  return next === 'working' && statusOfSession(id) === 'stopping' ? null : next;
};

const takeEvent = (id: number, event: AcpEventView): void => {
  if (event.kind === 'terminalOutput') {
    pushTerminalBytes(event.terminalId, Uint8Array.from(event.bytes));
    return;
  }
  putFeed(id, applyEvent(feedOf(id), event));
  rememberWhatAgentControls(id, event);
  const status = stopStaysPressedUntilTurnEnds(id, event);
  if (status) useAgentSessions.getState().setStatus(id, status);
};

const heldUntilSessionIdArrives = () => {
  const held: AcpEventView[] = [];
  let known: number | null = null;
  return {
    take: (event: AcpEventView): void => {
      if (known === null) held.push(event);
      else takeEvent(known, event);
    },
    release: (id: number): void => {
      known = id;
      held.splice(0).forEach((event) => takeEvent(id, event));
    },
  };
};

export const openAgentSession = async (repo: string): Promise<number> => {
  const arriving = heldUntilSessionIdArrives();
  const id = await acpOpen(repo, arriving.take);
  putFeed(id, []);
  setDraft(id, '');
  useAgentSessions.getState().add(id, repo, ACP_TITLE);
  arriving.release(id);
  return id;
};

const agentAlreadyServingRepo = (repo: string): number | null => {
  const state = useAgentSessions.getState();
  return activeOf(state, repo) ?? agentsOfRepo(state, repo).at(-1)?.id ?? null;
};

export const askAgentAbout = async (repo: string, mention: string): Promise<number> => {
  const id = agentAlreadyServingRepo(repo) ?? (await openAgentSession(repo));
  setDraft(id, withMentionAppended(draftOf(id), mention));
  return id;
};

export const askAgentInDock = (repo: string, mention: string): Promise<void> =>
  askAgentAbout(repo, mention).then((id) => {
    writePref('term.dock.open', true);
    useAgentSessions.getState().setActive(repo, id);
  });

const sessionDied = (id: number, failure: unknown): void => {
  putFeed(id, [...feedOf(id), { kind: 'ended', reason: reasonOf(failure) }]);
  useAgentSessions.getState().setStatus(id, 'dead');
};

export const sendPrompt = async (id: number, text: string): Promise<void> => {
  putFeed(id, [...feedOf(id), { kind: 'user', text }]);
  useAgentSessions.getState().setStatus(id, 'working');
  try {
    await acpPrompt(id, text);
  } catch (failure) {
    sessionDied(id, failure);
  }
};

export const stopTurn = async (id: number): Promise<void> => {
  useAgentSessions.getState().setStatus(id, 'stopping');
  try {
    await acpCancel(id);
  } catch (failure) {
    sessionDied(id, failure);
  }
};

export const answerPermission = async (
  id: number,
  requestId: number,
  optionId: string,
): Promise<void> => {
  putFeed(id, resolvePermission(feedOf(id), requestId, optionId));
  useAgentSessions.getState().setStatus(id, 'working');
  try {
    await acpPermission(id, requestId, optionId);
  } catch (failure) {
    sessionDied(id, failure);
  }
};

export const setConfigValue = (id: number, configId: string, value: string): Promise<void> =>
  acpSetConfig(id, configId, value);

export const rollbackCheckpoint = (
  repo: string,
  item: { oid: string | null; paths: string[] },
): Promise<void> => acpRollback(repo, item.oid, item.paths);
