import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  drawFrame,
  maxScroll,
  rowAtY,
  ROW_H,
  SCROLLBAR_W,
  type Frame,
  type Meta,
} from './render';
import type { CommitView, LayoutView, RefView } from './types';

const PAGE = 5000;

const emptyMeta = (): Meta => ({ hash: [], author: [], time: [], subject: [], body: [] });

export default function App() {
  const [layout, setLayout] = useState<LayoutView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openMs, setOpenMs] = useState<number | null>(null);
  const [metaMs, setMetaMs] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Всё, что меняется на скролл, живёт в ref: React в кадре не участвует.
  const frameRef = useRef<Frame>({
    layout: null,
    meta: emptyMeta(),
    refsByCommit: new Map(),
    scrollY: 0,
    hover: null,
    selected: null,
    width: 0,
    height: 0,
  });
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);

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
    const count = f.layout?.count ?? 0;
    return Math.max(0, Math.min(value, maxScroll(count, f.height)));
  }, []);

  /* ---------------------------- размер вьюпорта ---------------------------- */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      patch({
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
        scrollY: clampScroll(frameRef.current.scrollY),
      });
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
      // deltaMode: 0 пиксели, 1 строки, 2 страницы
      const unit = e.deltaMode === 1 ? ROW_H : e.deltaMode === 2 ? frameRef.current.height : 1;
      patch({ scrollY: clampScroll(frameRef.current.scrollY + e.deltaY * unit) });
    };

    const onKey = (e: KeyboardEvent) => {
      const f = frameRef.current;
      const page = f.height - ROW_H * 2;
      const total = (f.layout?.count ?? 0) * ROW_H;
      let next: number | null = null;
      if (e.key === 'PageDown') next = f.scrollY + page;
      else if (e.key === 'PageUp') next = f.scrollY - page;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = total;
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

  /* ------------------------------ мышь ------------------------------ */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const localY = (e: MouseEvent) => e.clientY - host.getBoundingClientRect().top;
    const localX = (e: MouseEvent) => e.clientX - host.getBoundingClientRect().left;

    const onMove = (e: MouseEvent) => {
      const f = frameRef.current;
      if (dragRef.current) {
        const total = (f.layout?.count ?? 0) * ROW_H;
        const thumbH = Math.max(28, (f.height / total) * f.height);
        const ratio = (total - f.height) / Math.max(1, f.height - thumbH);
        const dy = localY(e) - dragRef.current.startY;
        patch({ scrollY: clampScroll(dragRef.current.startScroll + dy * ratio) });
        return;
      }
      const index = rowAtY(localY(e), f.scrollY, f.layout?.count ?? 0);
      if (index !== f.hover) patch({ hover: index });
    };

    const onDown = (e: MouseEvent) => {
      const f = frameRef.current;
      if (localX(e) >= f.width - SCROLLBAR_W) {
        dragRef.current = { startY: localY(e), startScroll: f.scrollY };
        return;
      }
      const index = rowAtY(localY(e), f.scrollY, f.layout?.count ?? 0);
      patch({ selected: index });
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
  }, [patch, clampScroll]);

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
      patch({ layout: view, meta, refsByCommit, scrollY: 0, selected: null, hover: null });

      // Метаданные тянем целиком: пока они не в памяти, быстрый скролл всё равно
      // упрётся в IPC. Если на большой репе это станет дорого — увидим по числу.
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
      patch({ layout: null, meta: emptyMeta(), refsByCommit: new Map() });
    } finally {
      setLoading(false);
    }
  }, [patch, schedule]);

  return (
    <div className="app">
      <header>
        <button onClick={pickRepo} disabled={loading}>
          {loading ? 'Открываю…' : 'Открыть репозиторий'}
        </button>
        {layout ? (
          <span className="stats">
            <b>{layout.count.toLocaleString('ru')}</b> коммитов · дорожек {layout.max_lane + 1} ·
            чтение {layout.read_ms.toFixed(0)} мс · раскладка {layout.layout_ms.toFixed(1)} мс
            {openMs !== null ? ` · с IPC ${openMs.toFixed(0)} мс` : ''}
            {metaMs !== null ? ` · метаданные ${metaMs.toFixed(0)} мс` : ''}
            {layout.truncated ? ' · обрезано' : ''}
          </span>
        ) : null}
        {layout ? <span className="path">{layout.path}</span> : null}
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="host" ref={hostRef} tabIndex={0}>
        <canvas ref={canvasRef} className="surface" />
        {!layout && !loading ? (
          <div className="empty">Выбери локальный репозиторий, чтобы посмотреть граф</div>
        ) : null}
      </div>
    </div>
  );
}
