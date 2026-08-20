import { useCallback, useEffect, useRef } from 'react';
import {
  drawFrame,
  layoutColumns,
  listWidth,
  loadHidden,
  loadWidths,
  maxScroll,
  maxScrollX,
  rowTop,
  scrollToCenter,
  scrollToReveal,
  buildMinimap,
  wipInputShown,
  wipInputWidth,
  type Divider,
  type Frame,
  type Metrics,
  type RowCache,
  type StoredWidths,
} from '@/entities/graph';
import { readPref } from '@/shared/lib/prefs';
import { GRAPH_MINIMAP_DEFAULT, SETTINGS } from '@/shared/config/settingsModel';
import type { Session } from '@/entities/repo';
import type { AvatarCache } from '@/shared/ui/avatarCache';

export type Drag =
  'minimap' | 'hscroll' | { divider: Divider; fromX: number; fromStored: StoredWidths } | null;

export type GraphSurface = {
  frameRef: React.MutableRefObject<Frame>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  hostRef: React.MutableRefObject<HTMLDivElement | null>;
  inputRef: React.MutableRefObject<HTMLDivElement | null>;
  storedRef: React.MutableRefObject<StoredWidths>;
  hiddenRef: React.MutableRefObject<ReturnType<typeof loadHidden>>;
  minimapRef: React.MutableRefObject<boolean>;
  dragRef: React.MutableRefObject<Drag>;
  patch: (next: Partial<Frame>) => void;
  clampScroll: (value: number) => number;
  clampScrollX: (value: number) => number;
  reflow: () => void;
};

const emptyFrame = (metrics: Metrics, rows: RowCache, columns: Frame['columns']): Frame => ({
  repo: null,
  rows,
  columns,
  avatars: null,
  cols: layoutColumns(listWidth(0), {}),
  pullHeads: new Set(),
  hoverChip: null,
  veil: null,
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

export function useGraphFrame({
  session,
  rows,
  avatars,
  pullHeads,
  redraw,
  metrics,
  columns,
  onNeed,
}: {
  session: Session | null;
  rows: RowCache;
  avatars: AvatarCache | null;
  pullHeads: ReadonlySet<string>;
  redraw: number;
  metrics: Metrics;
  columns: Frame['columns'];
  onNeed: (chunks: number[]) => void;
}): GraphSurface {
  const inputRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<Frame>(emptyFrame(metrics, rows, columns));
  const rafRef = useRef<number | null>(null);
  const storedRef = useRef<StoredWidths>(loadWidths());
  const hiddenRef = useRef(loadHidden());
  const minimapRef = useRef(readPref<boolean>(SETTINGS.graphMinimap, GRAPH_MINIMAP_DEFAULT));
  const dragRef = useRef<Drag>(null);

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
      veil: sameRepo ? f.veil : null,
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

  return {
    frameRef,
    canvasRef,
    hostRef,
    inputRef,
    storedRef,
    hiddenRef,
    minimapRef,
    dragRef,
    patch,
    clampScroll,
    clampScrollX,
    reflow,
  };
}
