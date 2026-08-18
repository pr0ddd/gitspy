import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { chipsFor } from '@/entities/graph';
import { buildChipMenu, showNativeMenu, type MenuAction } from '@/features/menus';
import type { Confirmation } from '@/entities/repo';
import type { Operation, RefView, RemoteView } from '@/shared/api/types';
import type { Ask } from '../AskBar';

export function useRefMenu({
  remotes,
  remoteNames,
  currentBranch,
  onCheckout,
  onRun,
  onConfirm,
  onCopy,
  onAsk,
  onWorktree,
  onOpenUrl,
}: {
  remotes: readonly RemoteView[];
  remoteNames: readonly string[];
  currentBranch: string | null;
  onCheckout: (ref: RefView) => void;
  onRun: (operation: Operation) => void;
  onConfirm: (confirmation: Confirmation) => void;
  onCopy: (text: string) => void;
  onAsk: (ask: Ask) => void;
  onWorktree: (at: string) => void;
  onOpenUrl: (url: string) => void;
}): (ref: RefView) => void {
  const { t } = useTranslation();
  return useCallback(
    (ref: RefView) => {
      const chip = chipsFor([ref], remoteNames)[0];
      if (!chip) return;
      const sections = buildChipMenu(chip, {
        currentBranch,
        remotes: remotes.map((r) => ({ name: r.name, webUrl: r.webUrl })),
        head: null,
      });
      if (!sections.length) return;
      void showNativeMenu(
        sections,
        (key, params) => t(key as 'menu.copyBranch', params),
        (action: MenuAction) => {
          if (action.kind === 'checkoutRef') onCheckout(action.ref);
          else if (action.kind === 'run') onRun(action.operation);
          else if (action.kind === 'copy') onCopy(action.text);
          else if (action.kind === 'worktree') onWorktree(action.at);
          else if (action.kind === 'openUrl') onOpenUrl(action.url);
          else if (action.kind === 'ask') onAsk(action.ask);
          else if (action.kind === 'confirm') onConfirm(action.confirmation);
        },
      );
    },
    [
      remotes,
      remoteNames,
      currentBranch,
      onCheckout,
      onRun,
      onConfirm,
      onCopy,
      onAsk,
      onWorktree,
      onOpenUrl,
      t,
    ],
  );
}
