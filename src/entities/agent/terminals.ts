export const TERMINAL_REPLAY_LIMIT = 262144;

type TerminalWatcher = (bytes: Uint8Array) => void;

const printed = new Map<string, Uint8Array>();
const watchers = new Map<string, Set<TerminalWatcher>>();

const EMPTY = new Uint8Array();

const tailWithinLimit = (before: Uint8Array, chunk: Uint8Array): Uint8Array => {
  const joined = new Uint8Array(before.length + chunk.length);
  joined.set(before);
  joined.set(chunk, before.length);
  return joined.length > TERMINAL_REPLAY_LIMIT
    ? joined.slice(joined.length - TERMINAL_REPLAY_LIMIT)
    : joined;
};

export const pushTerminalBytes = (terminalId: string, bytes: Uint8Array): void => {
  printed.set(terminalId, tailWithinLimit(printed.get(terminalId) ?? EMPTY, bytes));
  watchers.get(terminalId)?.forEach((take) => take(bytes));
};

export const onTerminalBytes = (terminalId: string, take: TerminalWatcher): (() => void) => {
  const already = printed.get(terminalId);
  if (already !== undefined && already.length > 0) take(already);
  const watching = watchers.get(terminalId) ?? new Set<TerminalWatcher>();
  watching.add(take);
  watchers.set(terminalId, watching);
  return () => {
    watching.delete(take);
    if (watching.size === 0) watchers.delete(terminalId);
  };
};
