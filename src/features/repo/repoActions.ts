import { useCallback } from 'react';
import * as ipc from '@/ipc';
import {
  notifyCopied,
  notifyError,
  notifyOperation,
  notifyOperationFailed,
} from '@/toast';
import { runRepoWork } from './repoWork';
import type { Operation, RefView } from '@/types';

export function useOperations(active: string | null, reload: (path: string) => Promise<void>) {
  const runOperation = useCallback(
    (operation: Operation) => {
      if (!active) return;
      void runRepoWork(active, { kind: operation.kind }, async () => {
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
    [active, reload],
  );

  const checkoutRef = useCallback(
    (ref: RefView) => {
      if (!active) return;
      void runRepoWork(active, { kind: 'checkout', target: ref.name }, () =>
        ipc.checkoutRef(active, ref.name, ref.kind).then(() => reload(active)),
      );
    },
    [active, reload],
  );

  return { runOperation, checkoutRef };
}

export const copyText = (text: string): void => {
  void navigator.clipboard.writeText(text);
  notifyCopied(text);
};

export const openExternalUrl = (url: string): void => {
  ipc.openUrl(url).catch(notifyError);
};
