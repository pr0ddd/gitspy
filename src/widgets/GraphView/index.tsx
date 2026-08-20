import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MINIMAP_W, VSCROLL_W, type Metrics, type RowCache } from '@/entities/graph';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { Icon } from '@/shared/ui/icons';
import { Input } from '@/shared/ui/input';
import { useCommands } from '@/features/keyboard';
import { stepped } from '@/shared/lib/roving';
import type { Confirmation, Session } from '@/entities/repo';
import type { AvatarCache } from '@/shared/ui/avatarCache';
import type { Ask } from '../AskBar';
import type { Operation, RefView } from '@/shared/api/types';
import { useChipHit } from './useChipHit';
import { useGraphFrame } from './useGraphFrame';
import { useGraphMenus } from './useGraphMenus';
import { useHoverVeil } from './useHoverVeil';
import { useGraphPointer, type HoverNode } from './useGraphPointer';
import { useGraphWheel } from './useGraphWheel';

type Props = {
  session: Session | null;
  avatars: AvatarCache | null;
  rows: RowCache;
  redraw: number;
  metrics: Metrics;
  pullHeads: ReadonlySet<string>;
  currentBranch: string | null;
  onSelect: (index: number) => void;
  onCheckoutRef: (ref: RefView) => void;
  onRun: (operation: Operation) => void;
  onConfirm: (confirmation: Confirmation) => void;
  onCopy: (text: string) => void;
  onAsk: (ask: Ask) => void;
  onWorktree: (at: string) => void;
  onOpenUrl: (url: string) => void;
  onNeed: (chunks: number[]) => void;
  message: string;
  onMessage: (text: string) => void;
  onCommit: () => void;
  compact: boolean;
  onCompact: (next: boolean) => void;
};

export const GraphView = memo(function GraphView({
  session,
  avatars,
  rows,
  redraw,
  metrics,
  pullHeads,
  currentBranch,
  onSelect,
  onCheckoutRef,
  onRun,
  onConfirm,
  onCopy,
  onAsk,
  onWorktree,
  onOpenUrl,
  onNeed,
  message,
  onMessage,
  onCommit,
  compact,
  onCompact,
}: Props) {
  const { t } = useTranslation();
  const [hoverNode, setHoverNode] = useState<HoverNode | null>(null);
  const wip = rows.row(0);
  const conflicted = wip?.kind === 'workingTree' && wip.conflicts > 0 ? wip.conflicts : 0;
  const columns = useMemo(
    () => ({
      branchTag: t('column.branchTag'),
      graph: t('column.graph'),
      message: t('column.message'),
      author: t('column.author'),
      date: t('column.date'),
      sha: t('column.sha'),
      workingTree: t('column.workingTree'),
      inProgress: t('graph.inProgress'),
      mergeConflicts: conflicted
        ? t('graph.mergeConflicts', { count: conflicted, branch: currentBranch ?? '' })
        : '',
    }),
    [t, conflicted, currentBranch],
  );

  const surface = useGraphFrame({
    session,
    rows,
    avatars,
    pullHeads,
    redraw,
    metrics,
    columns,
    onNeed,
  });
  const { canvasRef, hostRef, inputRef, minimapRef } = surface;

  const chosen = session?.selected ?? 0;
  const rowCount = session?.repo?.count ?? 0;
  useCommands('graph', {
    selectNext: () => onSelect(stepped(chosen, 1, rowCount)),
    selectPrevious: () => onSelect(stepped(chosen, -1, rowCount)),
    selectFirst: () => onSelect(0),
    selectLast: () => onSelect(Math.max(0, rowCount - 1)),
  });

  const hideHoverNode = useCallback(() => setHoverNode(null), []);
  useGraphWheel(surface, hideHoverNode);
  const chipHitAt = useChipHit(surface);
  useGraphMenus(surface, chipHitAt, {
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
  });
  const veil = useHoverVeil(surface);
  useGraphPointer(surface, chipHitAt, veil, { onSelect, onCheckoutRef, setHoverNode });

  return (
    <div
      data-area="graph"
      className="relative min-h-0 flex-1 overflow-hidden outline-none"
      ref={hostRef}
      tabIndex={0}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" />
      {hoverNode ? (
        <Tooltip open>
          <TooltipTrigger asChild>
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: hoverNode.x - hoverNode.r,
                top: hoverNode.y - hoverNode.r,
                width: hoverNode.r * 2,
                height: hoverNode.r * 2,
              }}
            />
          </TooltipTrigger>
          <TooltipContent side="right">{hoverNode.authors}</TooltipContent>
        </Tooltip>
      ) : null}

      <div
        ref={inputRef}
        className="absolute top-0 left-0 hidden"
        style={{ willChange: 'transform' }}
      >
        <Input
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onCommit();
            e.stopPropagation();
          }}
          onWheel={(e) => e.stopPropagation()}
          placeholder={t('workingTree.messagePlaceholder')}
          className="h-full text-sm"
        />
      </div>
      {session?.loading ? (
        <div
          className="text-muted-foreground pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ right: minimapRef.current ? MINIMAP_W : VSCROLL_W }}
        >
          <Icon.waiting className="size-5 animate-spin" />
          <span className="text-sm">{t('repo.reading', { name: session.name })}</span>
        </div>
      ) : null}

      {!session || (!session.repo && !session.loading) ? (
        <div
          className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ right: minimapRef.current ? MINIMAP_W : VSCROLL_W }}
        >
          {t('repo.emptyHint')}
        </div>
      ) : null}
    </div>
  );
});
