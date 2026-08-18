import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import * as ipc from '@/shared/api/ipc';
import { notifyDeleted, notifyError } from '@/shared/ui/toast';
import type { Effect } from '@/entities/repo';
import type { Operation, PathOperation, WorkingTreeView } from '@/shared/api/types';
import { queuePathOperation } from './staging';

export function useWorkingTree(active: string | null): {
  tree: WorkingTreeView | null;
  adoptTree: (next: WorkingTreeView) => void;
} {
  const [tree, setTree] = useState<WorkingTreeView | null>(null);
  const adoptTree = useCallback((next: WorkingTreeView) => {
    setTree((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useEffect(() => {
    if (!active) {
      setTree(null);
      return;
    }
    ipc.workingTree(active).then(adoptTree).catch(notifyError);
  }, [active, adoptTree]);

  return { tree, adoptTree };
}

export function useWorkingTreeActions({
  active,
  tree,
  adoptTree,
  runOperation,
}: {
  active: string | null;
  tree: WorkingTreeView | null;
  adoptTree: (next: WorkingTreeView) => void;
  runOperation: (operation: Operation) => void;
}): {
  runPathOperation: (operation: PathOperation) => Promise<WorkingTreeView | null>;
  carryOut: (effect: Effect) => void;
} {
  const runPathOperation = useCallback(
    (operation: PathOperation): Promise<WorkingTreeView | null> => {
      if (!active) return Promise.resolve(null);
      const repo = active;
      return queuePathOperation(repo, operation, tree, (next) => ipc.stage(repo, next))
        .then((next) => {
          if (next) adoptTree(next);
          return next;
        })
        .catch((error: unknown) => {
          notifyError(error);
          return null;
        });
    },
    [active, tree, adoptTree],
  );

  const carryOut = useCallback(
    (effect: Effect) => {
      if (effect.kind === 'run') runOperation(effect.operation);
      else if (effect.kind === 'runPath') void runPathOperation(effect.operation);
      else if (active) {
        void ipc
          .removePath(active, effect.path)
          .then(() => notifyDeleted(effect.path))
          .catch(notifyError);
      }
    },
    [active, runOperation, runPathOperation],
  );

  return { runPathOperation, carryOut };
}

export function useAddWorktree(
  active: string | null,
  runOperation: (operation: Operation) => void,
): (at: string) => Promise<void> {
  const { t } = useTranslation();
  return useCallback(
    async (at: string) => {
      if (!active) return;
      const folder = await openDialog({
        directory: true,
        multiple: false,
        title: t('worktree.pickTitle'),
      });
      if (typeof folder !== 'string') return;
      runOperation({
        kind: 'worktreeAdd',
        path: `${folder}/${at.replaceAll('/', '-')}`,
        at,
      });
    },
    [active, runOperation, t],
  );
}
