import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  drawFrame,
  listWidth,
  maxScroll,
  MINIMAP_W,
  ROW_H,
  viewRowAtY,
  type Frame,
  type Meta,
} from './render';
import { ancestryMask, buildMinimap, buildView, type ViewRow } from './view';
import type { CommitView, LayoutView, RefView } from './types';

const PAGE = 5000;
const MIN_RUN = 3;

const emptyMeta = (): Meta => ({ hash: [], author: [], time: [], subject: [], body: [] });

const emptyFrame = (): Frame => ({
  layout: null,
  view: [],
  meta: emptyMeta(),
  refsByCommit: new Map(),
  minimap: null,
  ancestry: null,
  scrollY: 0,
  hover: null,
  selected: null,
  width: 0,
  height: 0,
});

export default function App() {
  const [layout, setLayout] = useState<LayoutView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openMs, setOpenMs] = useState<number | null>(null);
  const [metaMs, setMetaMs] = useState<number | null>(null);
  const [foldEnabled, setFoldEnabled] = useState(false);
  const [ancestryEnabled, setAncestryEnabled] = useState(true);
  const [foldedCount, setFoldedCount] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const frameRef = useRef<Frame>(emptyFrame());
  const rafRef = useRef<number | null>(null);
  const expandedRef = useRef<Set<number>>(new Set());
  const dragRef = useRef<'minimap' | null>(null);

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
    return Math.max(0, Math.min(value, maxScroll(f.view.length, f.height)));
  }, []);

  /** Пересобирает представление: свёртка меняет соответствие строк коммитам. */
  const rebuildView = useCallback(
    (opts?: { keepAnchor?: boolean }) => {
      const f = frameRef.current;
      if (!f.layout) return;

      const anchor = opts?.keepAnchor
        ? (f.view[Math.floor(f.scrollY / ROW_H)] ?? null)
        : null;
      const anchorCommit = anchor ? (anchor.fold ? anchor.start : anchor.index) : null;

      const view: ViewRow[] = buildView(f.layout, f.refsByCommit, {
        enabled: foldEnabled,
        minRun: MIN_RUN,
        expanded: expandedRef.current,
      });

      let scrollY = f.scrollY;
      if (anchorCommit !== null) {
        const at = view.findIndex((row) =>
          row.fold
            ? anchorCommit >= row.start && anchorCommit < row.start + row.len
            : row.index === anchorCommit,
        );
        if (at >= 0) scrollY = at * ROW_H;
      }

      const minimap = buildMinimap(f.layout, view, f.height);
      frameRef.current = { ...f, view, minimap };
      patch({ scrollY: clampScroll(scrollY) });

      setFoldedCount(f.layout.count - view.length);
    },
    [foldEnabled, patch, clampScroll],
  );

  useEffect(() => {
    rebuildView({ keepAnchor: true });
  }, [foldEnabled, rebuildView]);

  /* ---------------------------- размер вьюпорта ---------------------------- */

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
        minimap: buildMinimap(f.layout, f.view, height),
      };
      patch({ scrollY: clampScroll(frameRef.current.scrollY) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [patch, clampScroll]);

  /* -------------------------------- скролл -------------------------------- */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? ROW_H : e.deltaMode === 2 ? frameRef.current.height : 1;
      patch({ scrollY: clampScroll(frameRef.current.scrollY + e.deltaY * unit) });
    };

    const onKey = (e: KeyboardEvent) => {
      const f = frameRef.current;
      const page = f.height - ROW_H * 2;
      let next: number | null = null;
      if (e.key === 'PageDown') next = f.scrollY + page;
      else if (e.key === 'PageUp') next = f.scrollY - page;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = f.view.length * ROW_H;
      else if (e.key === 'ArrowDown') next = f.scrollY + ROW_H;
      else if (e.key === 'ArrowUp') next = f.scrollY - ROW_H;
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
  }, [patch, clampScroll]);

  /* -------------------------------- мышь -------------------------------- */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const local = (e: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    /** Клик по мини-карте: доля высоты — это доля всей истории. */
    const jumpFromMinimap = (y: number) => {
      const f = frameRef.current;
      const total = f.view.length * ROW_H;
      const target = (y / Math.max(1, f.height)) * total - f.height / 2;
      patch({ scrollY: clampScroll(target) });
    };

    const onMove = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      if (dragRef.current === 'minimap') {
        jumpFromMinimap(y);
        return;
      }
      const index = x >= listWidth(f.width) ? null : viewRowAtY(y, f.scrollY, f.view.length);
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
      const at = viewRowAtY(y, f.scrollY, f.view.length);
      if (at === null || !f.layout) {
        patch({ selected: null, ancestry: null });
        return;
      }
      const row = f.view[at];
      if (row.fold) {
        expandedRef.current.add(row.start);
        rebuildView({ keepAnchor: true });
        return;
      }
      patch({
        selected: at,
        ancestry: ancestryEnabled ? ancestryMask(f.layout, row.index) : null,
      });
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
  }, [patch, clampScroll, rebuildView, ancestryEnabled]);

  // Выключение подсветки гасит её сразу, не дожидаясь следующего клика.
  useEffect(() => {
    const f = frameRef.current;
    if (!ancestryEnabled) {
      patch({ ancestry: null });
      return;
    }
    if (f.selected === null || !f.layout) return;
    const row = f.view[f.selected];
    if (row && !row.fold) patch({ ancestry: ancestryMask(f.layout, row.index) });
  }, [ancestryEnabled, patch]);

  /* ------------------------------ открытие ------------------------------ */

  const pickRepo = useCallback(async () => {
    setError(null);
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: 'Выбери репозиторий',
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
      expandedRef.current = new Set();
      frameRef.current = {
        ...frameRef.current,
        layout: view,
        meta,
        refsByCommit,
        scrollY: 0,
        selected: null,
        hover: null,
        ancestry: null,
      };
      rebuildView();

      const t1 = performance.now();
      for (let start = 0; start < view.count; start += PAGE) {
        const items = await invoke<CommitView[]>('commit_range', { start, len: PAGE });
        for (const item of items) {
          meta.hash[item.index] = item.hash;
          meta.author[item.index] = item.author;
          meta.time[item.index] = item.time;
          meta.subject[item.index] = item.subject;
          meta.body[item.index] = item.body;
        }
        schedule();
      }
      setMetaMs(performance.now() - t1);
    } catch (e) {
      setError(String(e));
      setLayout(null);
      frameRef.current = { ...emptyFrame(), width: frameRef.current.width, height: frameRef.current.height };
      schedule();
    } finally {
      setLoading(false);
    }
  }, [rebuildView, schedule]);

  return (
    <div className="app">
      <header>
        <button onClick={pickRepo} disabled={loading}>
          {loading ? 'Открываю…' : 'Открыть репозиторий'}
        </button>

        {layout ? (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={foldEnabled}
                onChange={(e) => setFoldEnabled(e.target.checked)}
              />
              Сворачивать цепочки
              {foldEnabled && foldedCount > 0 ? (
                <span className="muted"> (−{foldedCount.toLocaleString('ru')})</span>
              ) : null}
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={ancestryEnabled}
                onChange={(e) => setAncestryEnabled(e.target.checked)}
              />
              Родословная
            </label>
            <span className="stats">
              <b>{layout.count.toLocaleString('ru')}</b> · дорожек {layout.max_lane + 1} · чтение{' '}
              {layout.read_ms.toFixed(0)} мс · раскладка {layout.layout_ms.toFixed(1)} мс
              {openMs !== null ? ` · IPC ${openMs.toFixed(0)} мс` : ''}
              {metaMs !== null ? ` · метаданные ${metaMs.toFixed(0)} мс` : ''}
            </span>
          </>
        ) : null}

        {layout ? <span className="path">{layout.path}</span> : null}
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="host" ref={hostRef} tabIndex={0} style={{ paddingRight: 0 }}>
        <canvas ref={canvasRef} className="surface" />
        {!layout && !loading ? (
          <div className="empty" style={{ right: MINIMAP_W }}>
            Выбери локальный репозиторий, чтобы посмотреть граф
          </div>
        ) : null}
      </div>
    </div>
  );
}
