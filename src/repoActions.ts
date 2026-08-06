import { useCallback, useState } from 'react';
import * as ipc from './ipc';
import {
  notifyCopied,
  notifyError,
  notifyOperation,
  notifyOperationFailed,
} from './toast';
import type { Operation, RefView } from './types';

export function useOperations(active: string | null, reload: (path: string) => Promise<void>) {
  const [running, setRunning] = useState<{ kind: string; target?: string } | null>(null);
  const busy = running !== null;
  const checkingOut = running?.kind === 'checkout' ? (running.target ?? null) : null;

  const busyWhile = useCallback(
    async (marker: { kind: string; target?: string }, work: () => Promise<unknown>) => {
      setRunning(marker);
      try {
        await work();
      } finally {
        setRunning(null);
      }
    },
    [],
  );

  const runOperation = useCallback(
    (operation: Operation) => {
      if (!active) return;
      void busyWhile({ kind: operation.kind }, async () => {
        try {
          await ipc.runOperation(active, operation, () => {});
        } catch (e) {
          notifyOperationFailed(operation, e);
          return;
        }
        notifyOperation(operation);
        void ipc.resolveAvatars(active).catch(() => undefined);
        await reload(active).catch(notifyError);
      });
    },
    [active, reload, busyWhile],
  );

  const checkoutRef = useCallback(
    (ref: RefView) => {
      if (!active) return;
      void busyWhile({ kind: 'checkout', target: ref.name }, () =>
        ipc
          .checkoutRef(active, ref.name, ref.kind)
          .then(() => reload(active))
          .catch(notifyError),
      );
    },
    [active, reload, busyWhile],
  );

  return { running, busy, checkingOut, busyWhile, runOperation, checkoutRef };
}

export const copyText = (text: string): void => {
  void navigator.clipboard.writeText(text);
  notifyCopied(text);
};

export const openExternalUrl = (url: string): void => {
  ipc.openUrl(url).catch(notifyError);
};
