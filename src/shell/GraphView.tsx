import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  drawFrame,
  graphLeft,
  graphRight,
  HSCROLL_H,
  listWidth,
  maxScroll,
  maxScrollX,
  MINIMAP_W,
  rowAtY,
  type Frame,
  type Metrics,
} from '../render';
import { buildMinimap } from '../view';
import { emptyMeta, type Session } from '../session';

type Props = {
  session: Session | null;
  metrics: Metrics;
  onSelect: (index: number | null) => void;
};

const emptyFrame = (metrics: Metrics): Frame => ({
  layout: null,
  meta: emptyMeta(),
  refsByCommit: new Map(),
  minimap: null,
  metrics,
  scrollY: 0,
  scrollX: 0,
  hover: null,
  selected: null,
  width: 0,
  height: 0,
});

export function GraphView({ session, metrics, onSelect }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<Frame>(emptyFrame(metrics));
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<'minimap' | 'hscroll' | null>(null);

  const schedule = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) drawFrame(canvas, frameRef.current);
    });
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
    return Math.max(0, Math.min(value, maxScroll(f.metrics, f.layout?.count ?? 0, f.height)));
  }, []);

  const clampScrollX = useCallback((value: number) => {
    const f = frameRef.current;
    return Math.max(0, Math.min(value, maxScrollX(f.metrics, f.layout?.max_lane ?? 0, f.width)));
  }, []);

  useEffect(() => {
    const f = frameRef.current;
    const sameRepo = f.layout?.path === session?.layout?.path;
    frameRef.current = {
      ...f,
      layout: session?.layout ?? null,
      meta: session?.meta ?? emptyMeta(),
      refsByCommit: session?.refsByCommit ?? new Map(),
      minimap: buildMinimap(session?.layout ?? null, f.height),
      selected: session?.selected ?? null,
      scrollY: sameRepo ? f.scrollY : 0,
      scrollX: sameRepo ? f.scrollX : 0,
      hover: sameRepo ? f.hover : null,
    };
    patch({ scrollY: clampScroll(frameRef.current.scrollY) });
  }, [session, patch, clampScroll]);

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
      frameRef.current = {
        ...f,
        width: Math.max(0, Math.round(rect.width)),
        height,
        minimap: buildMinimap(f.layout, height),
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
      const count = f.layout?.count ?? 0;
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
      const total = (f.layout?.count ?? 0) * f.metrics.rowH;
      patch({ scrollY: clampScroll((y / Math.max(1, f.height)) * total - f.height / 2) });
    };

    const dragHScroll = (x: number) => {
      const f = frameRef.current;
      const left = graphLeft();
      const track = graphRight(f.width) - left;
      const max = maxScrollX(f.metrics, f.layout?.max_lane ?? 0, f.width);
      patch({ scrollX: clampScrollX(((x - left) / Math.max(1, track)) * max * 1.15) });
    };

    const onMove = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      if (dragRef.current === 'minimap') return jumpFromMinimap(y);
      if (dragRef.current === 'hscroll') return dragHScroll(x);
      const index =
        x >= listWidth(f.width) ? null : rowAtY(f.metrics, y, f.scrollY, f.layout?.count ?? 0);
      if (index !== f.hover) patch({ hover: index });
    };

    const onDown = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      if (x >= listWidth(f.width)) {
        dragRef.current = 'minimap';
        jumpFromMinimap(y);
        return;
      }
      if (y >= f.height - HSCROLL_H && x >= graphLeft() && x <= graphRight(f.width)) {
        dragRef.current = 'hscroll';
        dragHScroll(x);
        return;
      }
      const picked = rowAtY(f.metrics, y, f.scrollY, f.layout?.count ?? 0);
      patch({ selected: picked });
      onSelect(picked);
    };

    const onUp = () => {
      dragRef.current = null;
    };
    const onLeave = () => patch({ hover: null });

    host.addEventListener('mousemove', onMove);
    host.addEventListener('mousedown', onDown);
    host.addEventListener('mouseleave', onLeave);
    window.addEventListener('mouseup', onUp);
    return () => {
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('mousedown', onDown);
      host.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('mouseup', onUp);
    };
  }, [patch, clampScroll, clampScrollX, onSelect]);

  return (
    <div className="host" ref={hostRef} tabIndex={0}>
      <canvas ref={canvasRef} className="surface" />
      {!session || (!session.layout && !session.loading) ? (
        <div className="empty" style={{ right: MINIMAP_W }}>
          {t('repo.emptyHint')}
        </div>
      ) : null}
    </div>
  );
}
