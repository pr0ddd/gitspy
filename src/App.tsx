import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  drawFrame,
  isCollapseHit,
  listWidth,
  maxScroll,
  METRICS_AVATARS,
  METRICS_COMPACT,
  MINIMAP_W,
  viewRowAtY,
  type Frame,
  type Meta,
  type Metrics,
} from './render';
import { ancestryMask, authorStats, buildMinimap, buildView, type ViewRow } from './view';
import type { CommitView, LayoutView, RefView } from './types';

const PAGE = 5000;
const MIN_RUN = 3;

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
  view: [],
  meta: emptyMeta(),
  refsByCommit: new Map(),
  minimap: null,
  ancestry: null,
  metrics,
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
  const [avatars, setAvatars] = useState(true);
  const [ancestryEnabled, setAncestryEnabled] = useState(true);
  const [foldAuthors, setFoldAuthors] = useState<ReadonlySet<number>>(new Set());
  const [foldedCount, setFoldedCount] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const metrics = avatars ? METRICS_AVATARS : METRICS_COMPACT;
  const frameRef = useRef<Frame>(emptyFrame(metrics));
  const rafRef = useRef<number | null>(null);
  /** Развёрнутые цепочки: начало → длина. Диапазон целиком, а не одна строка. */
  const expandedRef = useRef<Map<number, number>>(new Map());
  const foldAuthorsRef = useRef<ReadonlySet<number>>(foldAuthors);
  const dragRef = useRef<'minimap' | null>(null);

  const authors = useMemo(() => (layout ? authorStats(layout) : []), [layout]);

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
    return Math.max(0, Math.min(value, maxScroll(f.metrics, f.view.length, f.height)));
  }, []);

  const foldOptions = useCallback(
    () => ({
      authors: foldAuthorsRef.current,
      minRun: MIN_RUN,
      expanded: expandedRef.current,
    }),
    [],
  );

  const rebuildView = useCallback(
    (opts?: { keepAnchor?: boolean }) => {
      const f = frameRef.current;
      if (!f.layout) return;

      const anchor = opts?.keepAnchor
        ? (f.view[Math.floor(f.scrollY / f.metrics.rowH)] ?? null)
        : null;
      const anchorCommit = anchor ? (anchor.fold ? anchor.start : anchor.index) : null;

      const view: ViewRow[] = buildView(f.layout, f.refsByCommit, foldOptions());

      let scrollY = f.scrollY;
      if (anchorCommit !== null) {
        const at = view.findIndex((row) =>
          row.fold
            ? anchorCommit >= row.start && anchorCommit < row.start + row.len
            : row.index === anchorCommit,
        );
        if (at >= 0) scrollY = at * f.metrics.rowH;
      }

      frameRef.current = { ...f, view, minimap: buildMinimap(f.layout, view, f.height) };
      patch({ scrollY: clampScroll(scrollY) });
      setFoldedCount(f.layout.count - view.length);
    },
    [patch, clampScroll, foldOptions],
  );

  useEffect(() => {
    foldAuthorsRef.current = foldAuthors;
    expandedRef.current = new Map();
    rebuildView({ keepAnchor: true });
  }, [foldAuthors, rebuildView]);

  useEffect(() => {
    const f = frameRef.current;
    frameRef.current = { ...f, metrics };
    patch({ scrollY: clampScroll(f.scrollY) });
  }, [metrics, patch, clampScroll]);

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
      const f = frameRef.current;
      const unit = e.deltaMode === 1 ? f.metrics.rowH : e.deltaMode === 2 ? f.height : 1;
      patch({ scrollY: clampScroll(f.scrollY + e.deltaY * unit) });
    };

    const onKey = (e: KeyboardEvent) => {
      const f = frameRef.current;
      const page = f.height - f.metrics.rowH * 2;
      let next: number | null = null;
      if (e.key === 'PageDown') next = f.scrollY + page;
      else if (e.key === 'PageUp') next = f.scrollY - page;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = f.view.length * f.metrics.rowH;
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
  }, [patch, clampScroll]);

  /* -------------------------------- мышь -------------------------------- */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const local = (e: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const jumpFromMinimap = (y: number) => {
      const f = frameRef.current;
      const total = f.view.length * f.metrics.rowH;
      patch({ scrollY: clampScroll((y / Math.max(1, f.height)) * total - f.height / 2) });
    };

    const onMove = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      if (dragRef.current === 'minimap') {
        jumpFromMinimap(y);
        return;
      }
      const index =
        x >= listWidth(f.width) ? null : viewRowAtY(f.metrics, y, f.scrollY, f.view.length);
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
      const at = viewRowAtY(f.metrics, y, f.scrollY, f.view.length);
      if (at === null || !f.layout) {
        patch({ selected: null, ancestry: null });
        return;
      }
      const row = f.view[at];

      if (row.fold) {
        expandedRef.current.set(row.start, row.len);
        rebuildView({ keepAnchor: true });
        return;
      }

      // Шеврон у первого коммита развёрнутой цепочки — свернуть обратно.
      if (row.groupStart === row.index && isCollapseHit(x, f.width)) {
        expandedRef.current.delete(row.groupStart);
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
      setFoldAuthors(new Set());

      const refsByCommit = new Map<number, RefView[]>();
      for (const r of view.refs) {
        const list = refsByCommit.get(r.commit);
        if (list) list.push(r);
        else refsByCommit.set(r.commit, [r]);
      }

      const meta = emptyMeta();
      expandedRef.current = new Map();
      foldAuthorsRef.current = new Set();
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
          meta.email[item.index] = item.email;
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
      const f = frameRef.current;
      frameRef.current = { ...emptyFrame(f.metrics), width: f.width, height: f.height };
      schedule();
    } finally {
      setLoading(false);
    }
  }, [rebuildView, schedule]);

  const toggleAuthor = (id: number) => {
    setFoldAuthors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="app">
      <header>
        <button onClick={pickRepo} disabled={loading}>
          {loading ? 'Открываю…' : 'Открыть репозиторий'}
        </button>

        {layout ? (
          <>
            <div className="picker">
              <button className="ghost" onClick={() => setPickerOpen((v) => !v)}>
                Сворачивать цепочки
                {foldAuthors.size > 0 ? ` · ${foldAuthors.size}` : ''}
                {foldedCount > 0 ? (
                  <span className="muted"> −{foldedCount.toLocaleString('ru')}</span>
                ) : null}
              </button>
              {pickerOpen ? (
                <div className="menu">
                  <div className="menu-note">
                    Подряд идущие коммиты выбранного автора, у каждого один родитель,
                    без веток и меток, серией от {MIN_RUN}.
                  </div>
                  {authors.slice(0, 40).map((a) => (
                    <label key={a.id} className="menu-item">
                      <input
                        type="checkbox"
                        checked={foldAuthors.has(a.id)}
                        onChange={() => toggleAuthor(a.id)}
                      />
                      <span className="menu-name">{a.name}</span>
                      <span className="muted">{a.count.toLocaleString('ru')}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            <label
              className="toggle"
              title="Клик по коммиту гасит всё, что не является его предком или потомком"
            >
              <input
                type="checkbox"
                checked={ancestryEnabled}
                onChange={(e) => setAncestryEnabled(e.target.checked)}
              />
              Предки и потомки
            </label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={avatars}
                onChange={(e) => setAvatars(e.target.checked)}
              />
              Аватарки
            </label>

            <span className="stats">
              <b>{layout.count.toLocaleString('ru')}</b> · дорожек {layout.max_lane + 1} ·{' '}
              {layout.read_ms.toFixed(0)}/{layout.layout_ms.toFixed(1)} мс
              {openMs !== null ? ` · IPC ${openMs.toFixed(0)}` : ''}
              {metaMs !== null ? ` · мета ${metaMs.toFixed(0)}` : ''}
            </span>
          </>
        ) : null}

        {layout ? <span className="path">{layout.path}</span> : null}
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="host" ref={hostRef} tabIndex={0}>
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
