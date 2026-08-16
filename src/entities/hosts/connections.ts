import { createStore } from 'zustand/vanilla';
import type { AccountView, ConnectionView } from '@/shared/api/types';

export type HostsState = {
  readonly loaded: boolean;
  readonly connections: readonly ConnectionView[];
  readonly accounts: Readonly<Record<string, AccountView>>;
  readonly rejected: ReadonlySet<string>;
};

export const EMPTY_HOSTS: HostsState = {
  loaded: false,
  connections: [],
  accounts: {},
  rejected: new Set(),
};

export const isRejected = (state: HostsState, host: string): boolean => state.rejected.has(host);

export const withRejected = (state: HostsState, host: string): HostsState =>
  state.rejected.has(host) ? state : { ...state, rejected: new Set([...state.rejected, host]) };

const withoutRejection = (state: HostsState, host: string): HostsState => {
  if (!state.rejected.has(host)) return state;
  const rejected = new Set(state.rejected);
  rejected.delete(host);
  return { ...state, rejected };
};

export const hostsStore = createStore<HostsState>(() => EMPTY_HOSTS);

export const connectionOf = (state: HostsState, host: string): ConnectionView | null =>
  state.connections.find((c) => c.id === host) ?? null;

export const accountOf = (state: HostsState, host: string): AccountView | null =>
  state.accounts[host] ?? null;

export const withConnections = (
  state: HostsState,
  connections: readonly ConnectionView[],
): HostsState => {
  const kept = Object.fromEntries(
    Object.entries(state.accounts).filter(([host]) => connections.some((c) => c.id === host)),
  );
  return { ...state, loaded: true, connections, accounts: kept };
};

export const withAccount = (state: HostsState, account: AccountView): HostsState =>
  withoutRejection(
    { ...state, accounts: { ...state.accounts, [account.host]: account } },
    account.host,
  );

export const withoutHost = (state: HostsState, host: string): HostsState => {
  const accounts = { ...state.accounts };
  delete accounts[host];
  return withoutRejection(
    { ...state, connections: state.connections.filter((c) => c.id !== host), accounts },
    host,
  );
};

export const namespacesKnownUpFront = (connection: ConnectionView | null): string[] =>
  connection?.login ? [connection.login] : [];

export const mergeNamespaces = (known: readonly string[], fetched: readonly string[]): string[] =>
  Array.from(new Set([...known, ...fetched]));
