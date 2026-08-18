import { useEffect } from 'react';
import { useStore } from 'zustand';
import * as ipc from '@/shared/api/ipc';
import { isRejectedByHost } from '@/shared/api/errors';
import { notifyError, notifyHostConnected } from '@/shared/ui/toast';
import {
  accountOf,
  connectionOf,
  hostsStore,
  isRejected,
  withAccount,
  withConnections,
  withoutHost,
  withRejected,
} from '@/entities/hosts';

const refreshConnections = async (): Promise<void> => {
  const connections = await ipc.connections();
  hostsStore.setState((state) => withConnections(state, connections));
  await Promise.all(
    connections.map((connection) =>
      ipc
        .hostAccount(connection.id)
        .then((account) => {
          if (account) hostsStore.setState((state) => withAccount(state, account));
        })
        .catch(() => undefined),
    ),
  );
};

export function useHostsSync(): void {
  useEffect(() => {
    void refreshConnections().catch(notifyError);
    const connected = ipc.onHostConnected((account) => {
      hostsStore.setState((state) => withAccount(state, account));
      notifyHostConnected(account.host);
      void refreshConnections().catch(() => undefined);
    });
    const failed = ipc.onHostFailed(notifyError);
    return () => {
      void connected.then((stop) => stop());
      void failed.then((stop) => stop());
    };
  }, []);
}

export const useConnections = () => useStore(hostsStore, (state) => state.connections);

export const useConnectionsLoaded = () => useStore(hostsStore, (state) => state.loaded);

export const useConnection = (host: string) =>
  useStore(hostsStore, (state) => connectionOf(state, host));

export const useHostAccount = (host: string) =>
  useStore(hostsStore, (state) => accountOf(state, host));

export const disconnectHost = async (host: string): Promise<void> => {
  await ipc.disconnectHost(host);
  hostsStore.setState((state) => withoutHost(state, host));
};

export const useHostRejected = (host: string) =>
  useStore(hostsStore, (state) => isRejected(state, host));

export const noteHostError = (host: string, error: unknown): void => {
  if (isRejectedByHost(error)) hostsStore.setState((state) => withRejected(state, host));
};
