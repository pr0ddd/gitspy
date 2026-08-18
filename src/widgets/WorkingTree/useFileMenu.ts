import { useTranslation } from 'react-i18next';
import * as ipc from '@/shared/api/ipc';
import { buildFileMenu, showNativeMenu, type MenuAction } from '@/features/menus';
import { notifyError } from '@/shared/ui/toast';
import type { Confirmation } from '@/entities/repo';
import type {
  Operation,
  PathOperation,
  StatusEntryView,
  WorkingTreeView,
} from '@/shared/api/types';

export function useFileMenu({
  repo,
  onRun,
  onOperation,
  onCopy,
  onHistory,
  onConfirm,
}: {
  repo: string;
  onRun: (operation: PathOperation) => Promise<WorkingTreeView | null>;
  onOperation: (operation: Operation) => void;
  onCopy: (text: string) => void;
  onHistory: (path: string) => void;
  onConfirm: (confirmation: Confirmation) => void;
}): (entry: StatusEntryView) => void {
  const { t } = useTranslation();
  return (entry: StatusEntryView) => {
    showNativeMenu(
      buildFileMenu({ path: entry.path, staged: entry.staged }),
      (key, params) => t(key as 'menu.copyPath', params),
      (action: MenuAction) => {
        if (action.kind === 'pathRun') onRun(action.operation);
        else if (action.kind === 'run') onOperation(action.operation);
        else if (action.kind === 'copy') onCopy(action.text);
        else if (action.kind === 'ignore')
          void ipc.appendIgnore(repo, action.pattern).catch(notifyError);
        else if (action.kind === 'history') onHistory(action.path);
        else if (action.kind === 'openFile')
          void ipc.openPath(repo, action.path).catch(notifyError);
        else if (action.kind === 'reveal')
          void ipc.revealPath(repo, action.path).catch(notifyError);
        else if (action.kind === 'copyPatch')
          void ipc
            .workingTreeHunks(repo, action.path, action.staged)
            .then(onCopy)
            .catch(notifyError);
        else if (action.kind === 'confirm') onConfirm(action.confirmation);
      },
    ).catch(notifyError);
  };
}
