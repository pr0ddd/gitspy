import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  drawFrame,
  listWidth,
  maxScroll,
  METRICS_AVATARS,
  METRICS_COMPACT,
  graphLeft,
  graphRight,
  HSCROLL_H,
  maxScrollX,
  MINIMAP_W,
  rowAtY,
  type Frame,
  type Meta,
  type Metrics,
} from './render';
import { buildMinimap } from './view';
import { describeError, type ShownError } from './errors';
import type { CommitView, LayoutView, RefView } from './types';

const PAGE = 5000;

const emptyMeta = (): Meta => ({
  hash: [],
  author: [],
  email: [],
  time: [],
  subject: [],
  body: [],
});

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

export default function App() {
  const { t } = useTranslation();
  const { t: tError } = useTranslation('errors');
  const [layout, setLayout] = useState<LayoutView | null>(null);
  const [error, setError] = useState<ShownError | null>(null);
  const [loading, setLoading] = useState(false);
  const [openMs, setOpenMs] = useState<number | null>(null);
  const [metaMs, setMetaMs] = useState<number | null>(null);
  const [avatars, setAvatars] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const metrics = avatars ? METRICS_AVATARS : METRICS_COMPACT;
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
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
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
      const gL = graphLeft();
      const trackW = graphRight(f.width) - gL;
      const max = maxScrollX(f.metrics, f.layout?.max_lane ?? 0, f.width);
      patch({ scrollX: clampScrollX(((x - gL) / Math.max(1, trackW)) * max * 1.15) });
    };

    const onMove = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      if (dragRef.current === 'minimap') {
        jumpFromMinimap(y);
        return;
      }
      if (dragRef.current === 'hscroll') {
        dragHScroll(x);
        return;
      }
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
      patch({ selected: rowAtY(f.metrics, y, f.scrollY, f.layout?.count ?? 0) });
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
  }, [patch, clampScroll, clampScrollX]);

  const pickRepo = useCallback(async () => {
    setError(null);
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: t('repo.pickTitle'),
    });
    if (typeof picked !== 'string') return;

    setLoading(true);
    const t0 = performance.now();
    try {
      const view = await invoke<LayoutView>('open_repo', { path: picked });
      setOpenMs(performance.now() - t0);
      setLayout(view);

      const refsByCommit = new Map<number, RefView[]>();
      for (const r of view.refs) {
        const list = refsByCommit.get(r.commit);
        if (list) list.push(r);
        else refsByCommit.set(r.commit, [r]);
      }

      const meta = emptyMeta();
      const f = frameRef.current;
      frameRef.current = {
        ...f,
        layout: view,
        meta,
        refsByCommit,
        minimap: buildMinimap(view, f.height),
        scrollY: 0,
        scrollX: 0,
        selected: null,
        hover: null,
      };
      schedule();

      const t1 = performance.now();
      for (let start = 0; start < view.count; start += PAGE) {
        const items = await invoke<CommitView[]>('commit_range', { start, len: PAGE });
        for (const item of items) {
          meta.hash[item.index] = item.hash;
          meta.author[item.index] = item.author;
          meta.email[item.index] = item.email;
          meta.time[item.index] = item.time;
          meta.subject[item.index] = item.subject;
          meta.body[item.index] = item.body;
        }
        schedule();
      }
      setMetaMs(performance.now() - t1);
    } catch (e) {
      setError(describeError(e, tError));
      setLayout(null);
      const f = frameRef.current;
      frameRef.current = { ...emptyFrame(f.metrics), width: f.width, height: f.height };
      schedule();
    } finally {
      setLoading(false);
    }
  }, [schedule, t, tError]);

  return (
    <div className="app">
      <header>
        <button onClick={pickRepo} disabled={loading}>
          {loading ? t('repo.opening') : t('repo.open')}
        </button>

        {layout ? (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={avatars}
                onChange={(e) => setAvatars(e.target.checked)}
              />
              {t('graph.avatars')}
            </label>
            <span className="stats">
              {[
                t('graph.commits', { count: layout.count }),
                t('graph.lanes', { count: layout.max_lane + 1 }),
                t('stats.read', { ms: layout.read_ms.toFixed(0) }),
                t('stats.layout', { ms: layout.layout_ms.toFixed(1) }),
                openMs === null ? null : t('stats.ipc', { ms: openMs.toFixed(0) }),
                metaMs === null ? null : t('stats.meta', { ms: metaMs.toFixed(0) }),
                layout.truncated ? t('graph.truncated') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        ) : null}

        {layout ? <span className="path">{layout.path}</span> : null}
      </header>

      {error ? (
        <div className="error">
          {error.message}
          {error.detail ? <small>{error.detail}</small> : null}
        </div>
      ) : null}

      <div className="host" ref={hostRef} tabIndex={0}>
        <canvas ref={canvasRef} className="surface" />
        {!layout && !loading ? (
          <div className="empty" style={{ right: MINIMAP_W }}>
            {t('repo.emptyHint')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
