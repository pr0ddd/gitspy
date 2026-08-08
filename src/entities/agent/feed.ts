import type { AcpEventView, AcpOptionView, AcpPlanEntryView } from '@/types';

export type AgentStatus = 'working' | 'stopping' | 'waiting' | 'ready' | 'dead';

export type TerminalOutcome = { code: number | null; signal: string | null };

export type ToolItem = {
  kind: 'tool';
  id: string;
  title: string;
  status: string;
  terminalId: string | null;
  exit: TerminalOutcome | null;
};

export type SubagentItem = {
  kind: 'subagent';
  id: string;
  title: string;
  items: FeedItem[];
  done: boolean;
};

export type FeedItem =
  | { kind: 'user'; text: string }
  | { kind: 'agent'; text: string }
  | { kind: 'thought'; text: string }
  | ToolItem
  | SubagentItem
  | { kind: 'plan'; entries: AcpPlanEntryView[] }
  | {
      kind: 'permission';
      requestId: number;
      title: string;
      options: AcpOptionView[];
      resolved: string | null;
    }
  | { kind: 'checkpoint'; oid: string | null; paths: string[] }
  | { kind: 'ended'; reason: string };

export const turnIsRunning = (status: AgentStatus | undefined): boolean =>
  status === 'working' || status === 'stopping';

const turnEndedQuietly = (stopReason: string): boolean => stopReason === 'end_turn';

const startsNewTurn = (item: FeedItem): boolean => item.kind === 'user' || item.kind === 'ended';

const withChunkInOpenBlock = (
  items: FeedItem[],
  kind: 'agent' | 'thought',
  text: string,
): FeedItem[] => {
  const last = items[items.length - 1];
  if (last?.kind !== kind) return [...items, { kind, text }];
  return [...items.slice(0, -1), { kind, text: last.text + text }];
};

const subagentReportedBack = (status: string): boolean =>
  status === 'completed' || status === 'failed';

const mappedThroughTranscripts = (
  items: FeedItem[],
  change: (item: FeedItem) => FeedItem,
): FeedItem[] =>
  items.map((item) => {
    const changed = change(item);
    return changed.kind === 'subagent'
      ? { ...changed, items: mappedThroughTranscripts(changed.items, change) }
      : changed;
  });

const withToolStatus = (
  items: FeedItem[],
  id: string,
  status: string,
  terminalId: string | null,
): FeedItem[] =>
  mappedThroughTranscripts(items, (item) => {
    if (item.kind === 'tool' && item.id === id)
      return { ...item, status, terminalId: terminalId ?? item.terminalId };
    if (item.kind === 'subagent' && item.id === id)
      return { ...item, done: subagentReportedBack(status) };
    return item;
  });

const withTerminalOutcome = (
  items: FeedItem[],
  terminalId: string,
  exit: TerminalOutcome,
): FeedItem[] =>
  mappedThroughTranscripts(items, (item) =>
    item.kind === 'tool' && item.terminalId === terminalId ? { ...item, exit } : item,
  );

const nestedUnderTranscript = (
  items: FeedItem[],
  parentId: string,
  added: FeedItem,
): FeedItem[] | null => {
  let placed = false;
  const next = items.map((item) => {
    if (item.kind !== 'subagent') return item;
    if (item.id === parentId) {
      placed = true;
      return { ...item, items: [...item.items, added] };
    }
    const deeper = nestedUnderTranscript(item.items, parentId, added);
    if (deeper === null) return item;
    placed = true;
    return { ...item, items: deeper };
  });
  return placed ? next : null;
};

const startedCall = (event: Extract<AcpEventView, { kind: 'toolCall' }>): FeedItem =>
  event.subagent
    ? { kind: 'subagent', id: event.id, title: event.title, items: [], done: false }
    : {
        kind: 'tool',
        id: event.id,
        title: event.title,
        status: event.status,
        terminalId: event.terminalId,
        exit: null,
      };

const withCallStarted = (
  items: FeedItem[],
  event: Extract<AcpEventView, { kind: 'toolCall' }>,
): FeedItem[] => {
  const started = startedCall(event);
  const nested =
    event.parentId === null ? null : nestedUnderTranscript(items, event.parentId, started);
  return nested ?? [...items, started];
};

const lastOfCurrentTurn = (items: FeedItem[], kind: FeedItem['kind']): number => {
  for (let at = items.length - 1; at >= 0; at -= 1) {
    const item = items[at];
    if (startsNewTurn(item)) return -1;
    if (item.kind === kind) return at;
  }
  return -1;
};

const withPlanOfCurrentTurn = (items: FeedItem[], entries: AcpPlanEntryView[]): FeedItem[] => {
  const at = lastOfCurrentTurn(items, 'plan');
  if (at === -1) return [...items, { kind: 'plan', entries }];
  return items.map((item, index) => (index === at ? { kind: 'plan', entries } : item));
};

const checkpointOfCurrentTurn = (items: FeedItem[], oid: string | null): number => {
  const at = lastOfCurrentTurn(items, 'checkpoint');
  const found = items[at];
  return found?.kind === 'checkpoint' && found.oid === oid ? at : -1;
};

const withWrittenPath = (items: FeedItem[], oid: string | null, path: string): FeedItem[] => {
  const at = checkpointOfCurrentTurn(items, oid);
  if (at === -1) return [...items, { kind: 'checkpoint', oid, paths: [path] }];
  return items.map((item, index) =>
    index === at && item.kind === 'checkpoint' && !item.paths.includes(path)
      ? { ...item, paths: [...item.paths, path] }
      : item,
  );
};

export const applyEvent = (items: FeedItem[], event: AcpEventView): FeedItem[] => {
  switch (event.kind) {
    case 'messageChunk':
      return withChunkInOpenBlock(items, 'agent', event.text);
    case 'thought':
      return withChunkInOpenBlock(items, 'thought', event.text);
    case 'plan':
      return withPlanOfCurrentTurn(items, event.entries);
    case 'toolCall':
      return withCallStarted(items, event);
    case 'toolCallUpdate':
      return withToolStatus(items, event.id, event.status, event.terminalId);
    case 'terminalOutput':
      return items;
    case 'terminalExit':
      return withTerminalOutcome(items, event.terminalId, {
        code: event.code,
        signal: event.signal,
      });
    case 'permission':
      return [
        ...items,
        {
          kind: 'permission',
          requestId: event.requestId,
          title: event.title,
          options: event.options,
          resolved: null,
        },
      ];
    case 'checkpoint':
      return withWrittenPath(items, event.oid, event.path);
    case 'turnEnded':
      return turnEndedQuietly(event.stopReason)
        ? items
        : [...items, { kind: 'ended', reason: event.stopReason }];
    case 'fatal':
      return [...items, { kind: 'ended', reason: event.detail }];
    case 'abilities':
    case 'config':
    case 'configValue':
    case 'commands':
    case 'usage':
      return items;
  }
};

export const resolvePermission = (
  items: FeedItem[],
  requestId: number,
  optionId: string,
): FeedItem[] =>
  items.map((item) =>
    item.kind === 'permission' && item.requestId === requestId
      ? { ...item, resolved: optionId }
      : item,
  );

export const statusAfter = (event: AcpEventView): AgentStatus | null => {
  switch (event.kind) {
    case 'permission':
      return 'waiting';
    case 'turnEnded':
      return 'ready';
    case 'fatal':
      return 'dead';
    case 'messageChunk':
    case 'toolCall':
      return 'working';
    case 'checkpoint':
    case 'toolCallUpdate':
    case 'terminalOutput':
    case 'terminalExit':
    case 'thought':
    case 'plan':
    case 'abilities':
    case 'config':
    case 'configValue':
    case 'commands':
    case 'usage':
      return null;
  }
};
