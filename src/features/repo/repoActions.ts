import { useCallback } from 'react';
import * as ipc from '@/shared/api/ipc';
import { isRejectedPush } from '@/shared/api/errors';
import {
  notifyCopied,
  notifyError,
  notifyOperation,
  notifyOperationFailed,
} from '@/shared/ui/toast';
import { runRepoWork } from './repoWork';
import type { Operation, RefView } from '@/shared/api/types';

export function useOperations(
  active: string | null,
  reload: (path: string) => Promise<void>,
  onPushRejected: () => void = () => {},
) {
  const runOperation = useCallback(
    (operation: Operation) => {
      if (!active) return;
      void runRepoWork(active, { kind: operation.kind }, async () => {
        try {
          await ipc.runOperation(active, operation, () => {});
        } catch (e) {
          if (operation.kind === 'push' && isRejectedPush(e)) onPushRejected();
          else notifyOperationFailed(operation, e);
          return;
        }
        notifyOperation(operation);
        void ipc.resolveAvatars(active).catch(() => undefined);
        await reload(active).catch(notifyError);
      });
    },
    [active, reload, onPushRejected],
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
