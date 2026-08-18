import { useCallback } from 'react';
import * as ipc from '@/shared/api/ipc';
import { isRejectedPush } from '@/shared/api/errors';
import {
  notifyCheckedOut,
  notifyCopied,
  notifyError,
  notifyOperation,
  notifyOperationFailed,
  type Where,
} from '@/shared/ui/toast';
import { runRepoWork } from './repoWork';
import type { Operation, RefView } from '@/shared/api/types';

const NOWHERE: Where = { branch: null, upstream: null };

export function useOperations(
  active: string | null,
  reload: (path: string) => Promise<void>,
  onPushRejected: () => void = () => {},
  where: Where = NOWHERE,
) {
  const runOperation = useCallback(
    (operation: Operation) => {
      if (!active) return;
      void runRepoWork(active, { kind: operation.kind }, async () => {
        const outcome = await ipc
          .runOperation(active, operation, () => {})
          .catch((e: unknown) => {
            if (operation.kind === 'push' && isRejectedPush(e)) onPushRejected();
            else notifyOperationFailed(operation, e);
            return null;
          });
        if (!outcome) return;
        notifyOperation(operation, outcome, where);
        void ipc.resolveAvatars(active).catch(() => undefined);
        await reload(active).catch(notifyError);
      });
    },
    [active, reload, onPushRejected, where],
  );

  const checkoutRef = useCallback(
    (ref: RefView) => {
      if (!active) return;
      void runRepoWork(active, { kind: 'checkout', target: ref.name }, () =>
        ipc.checkoutRef(active, ref.name, ref.kind).then((landed) => {
          if (landed) notifyCheckedOut(landed);
          return reload(active);
        }),
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
