import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  chipAt,
  chipMetricsFor,
  drawFrame,
  listWidth,
  maxScroll,
  maxScrollX,
  MINIMAP_W,
  VSCROLL_W,
  placeChips,
  type Frame,
  type HoverChip,
  type Metrics,
} from '@/entities/graph';
import {
  HEADER_H,
  minimapFraction,
  rowAtY,
  rowTop,
  scrollToCenter,
  scrollToReveal,
} from '@/entities/graph';
import { chipsFor } from '@/entities/graph';
import { pointerTarget, type PointerScene } from '@/entities/graph';
import { authorsLine, graphGeometry, nodeHitAt, type NodeHit } from '@/entities/graph';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import {
  layoutColumns,
  loadHidden,
  loadWidths,
  reset,
  resized,
  saveHidden,
  saveWidths,
  DEFAULT_HIDDEN,
  type Divider,
  type StoredWidths,
} from '@/entities/graph';
import { Icon } from '@/shared/ui/icons';
import { Input } from '@/shared/ui/input';
import { useCommands } from '@/features/keyboard';
import { stepped } from '@/shared/lib/roving';
import { buildMinimap } from '@/entities/graph';
import {
  buildChipMenu,
  buildColumnsMenu,
  buildCommitMenu,
  type MenuAction,
  type MenuContext,
} from '@/features/menus';
import { showNativeMenu } from '@/features/menus';
import { readPref } from '@/shared/lib/prefs';
import type { Confirmation, Session } from '@/entities/repo';
import type { AvatarCache } from '@/shared/ui/avatarCache';
import type { RowCache } from '@/entities/graph';
import type { Ask } from './AskBar';
import type { Operation, RefView } from '@/shared/api/types';
import { GRAPH_MINIMAP_DEFAULT, SETTINGS } from '@/shared/config/settingsModel';
import { wipInputShown, wipInputWidth } from '@/entities/graph';

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

const emptyFrame = (metrics: Metrics, rows: RowCache, columns: Frame['columns']): Frame => ({
  repo: null,
  rows,
  columns,
  avatars: null,
  cols: layoutColumns(listWidth(0), {}),
  pullHeads: new Set(),
  hoverChip: null,
  refsByCommit: new Map(),
  minimap: null,
  metrics,
  scrollY: 0,
  scrollX: 0,
  hover: null,
  selected: 0,
  width: 0,
  height: 0,
});

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
  const inputRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hoverNode, setHoverNode] = useState<(NodeHit & { authors: string }) | null>(null);
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
  const frameRef = useRef<Frame>(emptyFrame(metrics, rows, columns));
  const rafRef = useRef<number | null>(null);
  const storedRef = useRef<StoredWidths>(loadWidths());
  const hiddenRef = useRef(loadHidden());
  const minimapRef = useRef(readPref<boolean>(SETTINGS.graphMinimap, GRAPH_MINIMAP_DEFAULT));
  const dragRef = useRef<
    'minimap' | 'hscroll' | { divider: Divider; fromX: number; fromStored: StoredWidths } | null
  >(null);

  const needRows = useCallback(() => {
    const f = frameRef.current;
    if (f.repo && f.repo.count > 0) {
      const first = Math.max(0, Math.floor(f.scrollY / f.metrics.rowH));
      const last = Math.min(f.repo.count, first + Math.ceil(f.height / f.metrics.rowH) + 1);
      const wanted = f.rows.missing(first, last, f.repo.count);
      if (wanted.length) onNeed(wanted);
    }
  }, [onNeed]);

  const placeMessageInput = useCallback(() => {
    const box = inputRef.current;
    if (!box) return;

    const f = frameRef.current;
    const first = f.repo ? Math.max(0, Math.floor(f.scrollY / f.metrics.rowH)) : 0;
    const shown = wipInputShown(f.rows.row(0), first);

    box.style.display = shown ? 'block' : 'none';
    if (!shown) return;

    const top = rowTop(f.metrics, 0, f.scrollY);
    box.style.transform = `translate3d(${f.cols.message.left + 12}px, ${top + 3}px, 0)`;
    box.style.width = `${wipInputWidth(f.cols)}px`;
    box.style.height = `${f.metrics.rowH - 6}px`;
  }, []);

  const schedule = useCallback(() => {
    needRows();

    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) drawFrame(canvas, frameRef.current);
      placeMessageInput();
    });
  }, [needRows, placeMessageInput]);

  const patch = useCallback(
    (next: Partial<Frame>) => {
      frameRef.current = { ...frameRef.current, ...next };
      schedule();
    },
    [schedule],
  );

  const clampScroll = useCallback((value: number) => {
    const f = frameRef.current;
    return Math.max(0, Math.min(value, maxScroll(f.metrics, f.repo?.count ?? 0, f.height)));
  }, []);

  const clampScrollX = useCallback((value: number) => {
    const f = frameRef.current;
    return Math.max(
      0,
      Math.min(value, maxScrollX(f.metrics, f.repo?.maxLane ?? 0, f.cols.graph.width)),
    );
  }, []);

  const reflow = useCallback(() => {
    const f = frameRef.current;
    frameRef.current = {
      ...f,
      cols: layoutColumns(
        listWidth(f.width, minimapRef.current),
        storedRef.current,
        hiddenRef.current,
      ),
    };
    patch({ scrollX: clampScrollX(frameRef.current.scrollX) });
  }, [patch, clampScrollX]);

  useEffect(() => {
    const f = frameRef.current;
    const sameRepo = f.repo?.path === session?.repo?.path;
    frameRef.current = {
      ...f,
      repo: session?.repo ?? null,
      rows,
      avatars,
      pullHeads,
      refsByCommit: session?.refsByCommit ?? new Map(),
      minimap: minimapRef.current ? buildMinimap(session?.repo ?? null, f.height) : null,
      columns,
      selected: session?.selected ?? 0,
      scrollY: sameRepo ? f.scrollY : 0,
      scrollX: sameRepo ? f.scrollX : 0,
      hover: sameRepo ? f.hover : null,
      hoverChip: sameRepo ? f.hoverChip : null,
    };
    patch({ scrollY: clampScroll(frameRef.current.scrollY) });
  }, [session, rows, avatars, columns, redraw, pullHeads, patch, clampScroll]);

  useEffect(() => {
    frameRef.current = { ...frameRef.current, metrics };
    patch({ scrollY: clampScroll(frameRef.current.scrollY) });
  }, [metrics, patch, clampScroll]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const f = frameRef.current;
      const height = Math.max(0, Math.round(rect.height));
      const width = Math.max(0, Math.round(rect.width));
      if (width === f.width && height === f.height) return;
      const sameHeight = height === f.height;
      frameRef.current = {
        ...f,
        width,
        height,
        cols: layoutColumns(
          listWidth(width, minimapRef.current),
          storedRef.current,
          hiddenRef.current,
        ),
        minimap:
          minimapRef.current && !(sameHeight && f.minimap)
            ? buildMinimap(f.repo, height)
            : f.minimap,
      };
      frameRef.current = { ...frameRef.current, scrollY: clampScroll(frameRef.current.scrollY) };
      needRows();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const canvas = canvasRef.current;
      if (canvas) drawFrame(canvas, frameRef.current);
      placeMessageInput();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [needRows, clampScroll, placeMessageInput]);

  const chosen = session?.selected ?? 0;
  const revealedRef = useRef<number | null>(null);
  useEffect(() => {
    const was = revealedRef.current;
    if (was === chosen) return;
    revealedRef.current = chosen;
    const f = frameRef.current;
    if (!f.repo) return;
    const stepAway = was !== null && Math.abs(chosen - was) <= 1;
    const bring = stepAway ? scrollToReveal : scrollToCenter;
    patch({ scrollY: clampScroll(bring(f.metrics, chosen, f.scrollY, f.height, f.repo.count)) });
  }, [chosen, patch, clampScroll]);

  const rowCount = session?.repo?.count ?? 0;
  useCommands('graph', {
    selectNext: () => onSelect(stepped(chosen, 1, rowCount)),
    selectPrevious: () => onSelect(stepped(chosen, -1, rowCount)),
    selectFirst: () => onSelect(0),
    selectLast: () => onSelect(Math.max(0, rowCount - 1)),
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = frameRef.current;
      const unit = e.deltaMode === 1 ? f.metrics.rowH : e.deltaMode === 2 ? f.height : 1;
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (dx !== 0) {
        patch({ scrollX: clampScrollX(f.scrollX + dx * unit) });
        return;
      }
      patch({ scrollY: clampScroll(f.scrollY + e.deltaY * unit) });
      setHoverNode(null);
    };

    const onKey = (e: KeyboardEvent) => {
      const f = frameRef.current;
      let next: number | null = null;
      if (e.key === 'PageDown') next = f.scrollY + (f.height - f.metrics.rowH * 2);
      else if (e.key === 'PageUp') next = f.scrollY - (f.height - f.metrics.rowH * 2);
      if (next === null) return;
      e.preventDefault();
      patch({ scrollY: clampScroll(next) });
    };

    host.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      host.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [patch, clampScroll, clampScrollX]);

  const chipHitAt = useCallback((x: number, y: number) => {
    const f = frameRef.current;
    if (!f.repo || x >= f.cols.branchTag.width) return null;
    const row = rowAtY(f.metrics, y, f.scrollY, f.repo.count);
    if (row === null) return null;
    const labels = f.refsByCommit.get(row);
    if (!labels) return null;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return null;

    ctx.font = f.metrics.font;
    const { placed, more } = placeChips(
      chipsFor(
        labels,
        f.repo.remotes.map((r) => r.name),
      ),
      (text) => ctx.measureText(text).width,
      f.cols.branchTag.width - 14,
      chipMetricsFor(f.metrics),
      f.pullHeads,
    );
    const one = chipAt(placed, x);
    if (one) return { row, at: placed.indexOf(one), chip: one.chip };
    if (more && x >= more.x && x < more.x + more.w) {
      return { row, at: 'more' as const, chip: null };
    }
    return null;
  }, []);

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
  }, [currentBranch]);

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
  }, [chipHitAt, menuContext, onSelect, patch, t, onMenuAction, compact, onCompact]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const local = (e: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const jumpFromMinimap = (y: number) => {
      const f = frameRef.current;
      const total = (f.repo?.count ?? 0) * f.metrics.rowH;
      patch({
        scrollY: clampScroll(minimapFraction(y, f.height) * total - f.height / 2),
      });
    };

    const dragHScroll = (x: number) => {
      const f = frameRef.current;
      const left = f.cols.graph.left;
      const track = f.cols.graph.width;
      const max = maxScrollX(f.metrics, f.repo?.maxLane ?? 0, f.cols.graph.width);
      patch({
        scrollX: clampScrollX(((x - left) / Math.max(1, track)) * max * 1.15),
      });
    };

    const dragDivider = (x: number) => {
      const held = dragRef.current;
      if (held === null || typeof held !== 'object') return;
      const f = frameRef.current;
      storedRef.current = resized(
        held.fromStored,
        layoutColumns(listWidth(f.width, minimapRef.current), held.fromStored, hiddenRef.current),
        held.divider,
        x - held.fromX,
      );
      saveWidths(storedRef.current);
      reflow();
    };

    const sceneOf = (f: Frame): PointerScene => ({
      width: f.width,
      minimap: minimapRef.current,
      height: f.height,
      cols: f.cols,
      metrics: f.metrics,
      scrollY: f.scrollY,
      count: f.repo?.count ?? 0,
    });

    const sameChip = (a: HoverChip | null, b: HoverChip | null) =>
      a === b || (a !== null && b !== null && a.row === b.row && a.at === b.at);

    const onMove = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      if (dragRef.current === 'minimap') return jumpFromMinimap(y);
      if (dragRef.current === 'hscroll') return dragHScroll(x);
      if (typeof dragRef.current === 'object' && dragRef.current !== null) return dragDivider(x);

      const target = pointerTarget(x, y, sceneOf(f));
      const hit = chipHitAt(x, y);
      host.style.cursor = hit ? 'pointer' : target.kind === 'divider' ? 'col-resize' : '';
      const index = target.kind === 'row' ? target.index : null;
      const hovered = hit ? { row: hit.row, at: hit.at } : null;
      if (index !== f.hover || !sameChip(hovered, f.hoverChip)) {
        patch({ hover: index, hoverChip: hovered });
      }
      showAuthorsUnder(x, y, f);
    };

    const showAuthorsUnder = (x: number, y: number, f: Frame) => {
      const g = graphGeometry(f.metrics, f.repo?.maxLane ?? 0, f.scrollX, f.cols);
      const node = nodeHitAt(
        f.metrics,
        g,
        f.scrollY,
        f.repo?.count ?? 0,
        (row) => f.rows.row(row)?.lane ?? null,
        x,
        y,
      );
      const row = node ? f.rows.row(node.row) : null;
      if (!node || row?.kind !== 'commit') {
        setHoverNode((now) => (now === null ? now : null));
        return;
      }
      setHoverNode((now) =>
        now && now.row === node.row && now.x === node.x && now.y === node.y
          ? now
          : { ...node, authors: authorsLine(row) },
      );
    };

    const onDown = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      const target = pointerTarget(x, y, sceneOf(f));

      switch (target.kind) {
        case 'minimap':
        case 'vscroll':
          dragRef.current = 'minimap';
          jumpFromMinimap(y);
          return;
        case 'divider':
          dragRef.current = {
            divider: target.divider,
            fromX: x,
            fromStored: { ...storedRef.current },
          };
          return;
        case 'hscroll':
          dragRef.current = 'hscroll';
          dragHScroll(x);
          return;
        case 'row':
          patch({ selected: target.index });
          onSelect(target.index);
          return;
        case 'none':
          return;
      }
    };

    const onUp = () => {
      dragRef.current = null;
    };
    const onLeave = () => {
      patch({ hover: null, hoverChip: null });
      setHoverNode(null);
    };

    const onDouble = (e: MouseEvent) => {
      const { x, y } = local(e);
      const hit = chipHitAt(x, y);
      if (hit && hit.chip && hit.chip.refs.length > 0) {
        onCheckoutRef(hit.chip.refs[0]);
        return;
      }
      const target = pointerTarget(x, y, sceneOf(frameRef.current));
      if (target.kind !== 'divider') return;
      let cleaned = storedRef.current;
      if (target.divider.take) cleaned = reset(cleaned, target.divider.take);
      if (target.divider.give) cleaned = reset(cleaned, target.divider.give);
      storedRef.current = cleaned;
      saveWidths(storedRef.current);
      reflow();
    };

    host.addEventListener('mousemove', onMove);
    host.addEventListener('mousedown', onDown);
    host.addEventListener('dblclick', onDouble);
    host.addEventListener('mouseleave', onLeave);
    window.addEventListener('mouseup', onUp);
    return () => {
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('mousedown', onDown);
      host.removeEventListener('dblclick', onDouble);
      host.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('mouseup', onUp);
    };
  }, [patch, clampScroll, clampScrollX, onSelect, onCheckoutRef, chipHitAt, reflow]);

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
