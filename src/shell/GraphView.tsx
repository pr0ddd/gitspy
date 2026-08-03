import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  drawFrame,
  listWidth,
  maxScroll,
  maxScrollX,
  MINIMAP_W,
  type Frame,
  type Metrics,
} from '../render';
import { minimapFraction, rowTop } from '../scene';
import { pointerTarget, type PointerScene } from '../graphInput';
import {
  layoutColumns,
  loadWidths,
  reset,
  resized,
  saveWidths,
  type Divider,
  type StoredWidths,
} from '../columns';
import { Icon } from '../icons';
import { buildMinimap } from '../view';
import type { Session } from '../session';
import type { AvatarCache } from '../avatarCache';
import type { RowCache } from '../rows';
import { GIT } from '../vocabulary';

type Props = {
  session: Session | null;
  avatars: AvatarCache | null;
  rows: RowCache;
  redraw: number;
  metrics: Metrics;
  onSelect: (index: number) => void;
  onNeed: (chunks: number[]) => void;
  message: string;
  onMessage: (text: string) => void;
  onCommit: () => void;
};

const emptyFrame = (metrics: Metrics, rows: RowCache, columns: Frame['columns']): Frame => ({
  repo: null,
  rows,
  columns,
  avatars: null,
  cols: layoutColumns(listWidth(0), {}),
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

export function GraphView({
  session,
  avatars,
  rows,
  redraw,
  metrics,
  onSelect,
  onNeed,
  message,
  onMessage,
  onCommit,
}: Props) {
  const inputRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const columns = {
    branchTag: GIT.branchTag,
    graph: GIT.graph,
    message: GIT.commitMessage,
    author: t('column.author'),
    date: t('column.date'),
    sha: GIT.sha,
    workingTree: GIT.workingTree,
    inProgress: t('graph.inProgress'),
  };
  const frameRef = useRef<Frame>(emptyFrame(metrics, rows, columns));
  const rafRef = useRef<number | null>(null);
  const storedRef = useRef<StoredWidths>(loadWidths());
  const dragRef = useRef<
    'minimap' | 'hscroll' | { divider: Divider; fromX: number; fromStored: StoredWidths } | null
  >(null);

  const schedule = useCallback(() => {
    const f = frameRef.current;
    if (f.repo && f.repo.count > 0) {
      const first = Math.max(0, Math.floor(f.scrollY / f.metrics.rowH));
      const last = Math.min(f.repo.count, first + Math.ceil(f.height / f.metrics.rowH) + 1);
      const wanted = f.rows.missing(first, last, f.repo.count);
      if (wanted.length) onNeed(wanted);
    }

    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) drawFrame(canvas, frameRef.current);
      placeMessageInput();
    });
  }, [onNeed]);

  const placeMessageInput = useCallback(() => {
    const box = inputRef.current;
    if (!box) return;

    const f = frameRef.current;
    const first = f.repo ? Math.max(0, Math.floor(f.scrollY / f.metrics.rowH)) : 0;
    const row = f.rows.row(0);
    const shown = row?.kind === 'workingTree' && first === 0;

    box.style.display = shown ? 'block' : 'none';
    if (!shown) return;

    const top = rowTop(f.metrics, 0, f.scrollY);
    box.style.transform = `translate3d(${f.cols.message.left + 12}px, ${top + 3}px, 0)`;
    box.style.width = `${Math.max(0, f.cols.message.width - 24)}px`;
    box.style.height = `${f.metrics.rowH - 6}px`;
  }, []);

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
      cols: layoutColumns(listWidth(f.width), storedRef.current),
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
      refsByCommit: session?.refsByCommit ?? new Map(),
      minimap: buildMinimap(session?.repo ?? null, f.height),
      columns,
      selected: session?.selected ?? 0,
      scrollY: sameRepo ? f.scrollY : 0,
      scrollX: sameRepo ? f.scrollX : 0,
      hover: sameRepo ? f.hover : null,
    };
    patch({ scrollY: clampScroll(frameRef.current.scrollY) });
  }, [session, redraw, patch, clampScroll]);

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
      frameRef.current = {
        ...f,
        width,
        height,
        cols: layoutColumns(listWidth(width), storedRef.current),
        minimap: buildMinimap(f.repo, height),
      };
      patch({ scrollY: clampScroll(frameRef.current.scrollY) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [patch, clampScroll]);

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
    };

    const onKey = (e: KeyboardEvent) => {
      const f = frameRef.current;
      const count = f.repo?.count ?? 0;
      let next: number | null = null;
      if (e.key === 'PageDown') next = f.scrollY + (f.height - f.metrics.rowH * 2);
      else if (e.key === 'PageUp') next = f.scrollY - (f.height - f.metrics.rowH * 2);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = count * f.metrics.rowH;
      else if (e.key === 'ArrowDown') next = f.scrollY + f.metrics.rowH;
      else if (e.key === 'ArrowUp') next = f.scrollY - f.metrics.rowH;
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
      patch({ scrollY: clampScroll(minimapFraction(y, f.height) * total - f.height / 2) });
    };

    const dragHScroll = (x: number) => {
      const f = frameRef.current;
      const left = f.cols.graph.left;
      const track = f.cols.graph.width;
      const max = maxScrollX(f.metrics, f.repo?.maxLane ?? 0, f.cols.graph.width);
      patch({ scrollX: clampScrollX(((x - left) / Math.max(1, track)) * max * 1.15) });
    };

    const dragDivider = (x: number) => {
      const held = dragRef.current;
      if (held === null || typeof held !== 'object') return;
      const f = frameRef.current;
      storedRef.current = resized(
        held.fromStored,
        layoutColumns(listWidth(f.width), held.fromStored),
        held.divider,
        x - held.fromX,
      );
      saveWidths(storedRef.current);
      reflow();
    };

    const sceneOf = (f: Frame): PointerScene => ({
      width: f.width,
      height: f.height,
      cols: f.cols,
      metrics: f.metrics,
      scrollY: f.scrollY,
      count: f.repo?.count ?? 0,
    });

    const onMove = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      if (dragRef.current === 'minimap') return jumpFromMinimap(y);
      if (dragRef.current === 'hscroll') return dragHScroll(x);
      if (typeof dragRef.current === 'object' && dragRef.current !== null) return dragDivider(x);

      const target = pointerTarget(x, y, sceneOf(f));
      host.style.cursor = target.kind === 'divider' ? 'col-resize' : '';
      const index = target.kind === 'row' ? target.index : null;
      if (index !== f.hover) patch({ hover: index });
    };

    const onDown = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      const target = pointerTarget(x, y, sceneOf(f));

      switch (target.kind) {
        case 'minimap':
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
    const onLeave = () => patch({ hover: null });

    const onDouble = (e: MouseEvent) => {
      const { x, y } = local(e);
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
  }, [patch, clampScroll, clampScrollX, onSelect, reflow]);

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden outline-none"
      ref={hostRef}
      tabIndex={0}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" />

      <div
        ref={inputRef}
        className="absolute top-0 left-0 hidden"
        style={{ willChange: 'transform' }}
      >
        <input
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onCommit();
            e.stopPropagation();
          }}
          onWheel={(e) => e.stopPropagation()}
          placeholder={t('workingTree.messagePlaceholder')}
          className="border-input bg-surface-raised text-foreground focus:border-ring h-full w-full rounded-sm border px-2 text-sm outline-none"
        />
      </div>
      {session?.loading ? (
        <div
          className="text-muted-foreground pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ right: MINIMAP_W }}
        >
          <Icon.waiting className="size-5 animate-spin" />
          <span className="text-sm">{t('repo.reading', { name: session.name })}</span>
        </div>
      ) : null}

      {!session || (!session.repo && !session.loading) ? (
        <div
          className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ right: MINIMAP_W }}
        >
          {t('repo.emptyHint')}
        </div>
      ) : null}
    </div>
  );
}
