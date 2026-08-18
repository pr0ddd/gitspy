import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_HIDDEN,
  HEADER_H,
  layoutColumns,
  listWidth,
  pointerTarget,
  saveHidden,
  saveWidths,
} from '@/entities/graph';
import {
  buildChipMenu,
  buildColumnsMenu,
  buildCommitMenu,
  showNativeMenu,
  type MenuAction,
  type MenuContext,
} from '@/features/menus';
import type { Confirmation } from '@/entities/repo';
import type { Operation, RefView } from '@/shared/api/types';
import type { Ask } from '../AskBar';
import type { ChipHit } from './useChipHit';
import type { GraphSurface } from './useGraphFrame';

export function useGraphMenus(
  { hostRef, frameRef, storedRef, hiddenRef, minimapRef, patch }: GraphSurface,
  chipHitAt: (x: number, y: number) => ChipHit | null,
  {
    currentBranch,
    compact,
    onCompact,
    onSelect,
    onCheckoutRef,
    onRun,
    onConfirm,
    onCopy,
    onAsk,
    onWorktree,
    onOpenUrl,
  }: {
    currentBranch: string | null;
    compact: boolean;
    onCompact: (next: boolean) => void;
    onSelect: (index: number) => void;
    onCheckoutRef: (ref: RefView) => void;
    onRun: (operation: Operation) => void;
    onConfirm: (confirmation: Confirmation) => void;
    onCopy: (text: string) => void;
    onAsk: (ask: Ask) => void;
    onWorktree: (at: string) => void;
    onOpenUrl: (url: string) => void;
  },
): void {
  const { t } = useTranslation();

  const onMenuAction = useCallback(
    (action: MenuAction) => {
      if (action.kind === 'checkoutRef') onCheckoutRef(action.ref);
      else if (action.kind === 'run') onRun(action.operation);
      else if (action.kind === 'copy') onCopy(action.text);
      else if (action.kind === 'worktree') onWorktree(action.at);
      else if (action.kind === 'openUrl') onOpenUrl(action.url);
      else if (action.kind === 'ask') onAsk(action.ask);
      else if (action.kind === 'confirm') onConfirm(action.confirmation);
    },
    [onCheckoutRef, onRun, onConfirm, onCopy, onAsk, onWorktree, onOpenUrl],
  );

  const menuContext = useCallback((): MenuContext => {
    const f = frameRef.current;
    const headIndex = f.repo?.head ?? null;
    const headRow = headIndex !== null ? f.rows.row(headIndex) : null;
    return {
      currentBranch,
      remotes: f.repo?.remotes.map((r) => ({ name: r.name, webUrl: r.webUrl })) ?? [],
      head:
        headRow?.kind === 'commit'
          ? { oid: headRow.hash, subject: headRow.subject, body: headRow.body }
          : null,
    };
  }, [currentBranch, frameRef]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onContext = (e: MouseEvent) => {
      const f = frameRef.current;
      if (!f.repo) return;
      e.preventDefault();

      const rect = host.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const chipTarget = chipHitAt(x, y);
      if (chipTarget) {
        if (!chipTarget.chip) return;
        const sections = buildChipMenu(chipTarget.chip, menuContext());
        if (sections.length)
          void showNativeMenu(
            sections,
            (key, params) => t(key as 'menu.copyBranch', params),
            onMenuAction,
          );
        return;
      }

      if (y < HEADER_H) {
        void showNativeMenu(
          buildColumnsMenu(hiddenRef.current, compact),
          (key, params) => t(key as 'column.author', params),
          (action: MenuAction) => {
            if (action.kind === 'toggleColumn') {
              const next = new Set(hiddenRef.current);
              if (!next.delete(action.column)) next.add(action.column);
              hiddenRef.current = next;
              saveHidden(next);
            } else if (action.kind === 'toggleCompact') {
              onCompact(!compact);
              return;
            } else if (action.kind === 'resetLayout') {
              storedRef.current = {};
              saveWidths({});
              hiddenRef.current = new Set(DEFAULT_HIDDEN);
              saveHidden(hiddenRef.current);
              onCompact(false);
            }
            const now = frameRef.current;
            frameRef.current = {
              ...now,
              cols: layoutColumns(
                listWidth(now.width, minimapRef.current),
                storedRef.current,
                hiddenRef.current,
              ),
            };
            patch({});
          },
        );
        return;
      }

      const target = pointerTarget(x, y, {
        width: f.width,
        minimap: minimapRef.current,
        height: f.height,
        cols: f.cols,
        metrics: f.metrics,
        scrollY: f.scrollY,
        count: f.repo.count,
      });
      if (target.kind !== 'row') return;
      const row = f.rows.row(target.index);
      if (!row || row.kind !== 'commit') return;

      patch({ selected: target.index });
      onSelect(target.index);
      void showNativeMenu(
        buildCommitMenu(row.hash, menuContext()),
        (key, params) => t(key as 'menu.copySha', params),
        onMenuAction,
      );
    };

    host.addEventListener('contextmenu', onContext);
    return () => host.removeEventListener('contextmenu', onContext);
  }, [
    hostRef,
    frameRef,
    storedRef,
    hiddenRef,
    minimapRef,
    chipHitAt,
    menuContext,
    onSelect,
    patch,
    t,
    onMenuAction,
    compact,
    onCompact,
  ]);
}
