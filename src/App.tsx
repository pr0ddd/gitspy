import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { drawGraph, graphWidth, ROW_H } from './graph';
import { colourOf, type CommitView, type LayoutView, type RefView } from './types';

const OVERSCAN = 12;
const PAGE = 200;

type Window = { start: number; end: number };

export default function App() {
  const [layout, setLayout] = useState<LayoutView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openMs, setOpenMs] = useState<number | null>(null);
  const [window_, setWindow] = useState<Window>({ start: 0, end: 0 });
  const [selected, setSelected] = useState<number | null>(null);
  const [, forceRender] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const metaRef = useRef<Map<number, CommitView>>(new Map());
  const pendingRef = useRef<Set<number>>(new Set());

  const refsByCommit = useMemo(() => {
    const map = new Map<number, RefView[]>();
    if (!layout) return map;
    for (const r of layout.refs) {
      const list = map.get(r.commit);
      if (list) list.push(r);
      else map.set(r.commit, [r]);
    }
    return map;
  }, [layout]);

  const pickRepo = useCallback(async () => {
    setError(null);
    const picked = await openDialog({ directory: true, multiple: false, title: 'Выбери репозиторий' });
    if (typeof picked !== 'string') return;

    setLoading(true);
    const t0 = performance.now();
    try {
      const view = await invoke<LayoutView>('open_repo', { path: picked });
      metaRef.current.clear();
      pendingRef.current.clear();
      setLayout(view);
      setSelected(null);
      setWindow({ start: 0, end: 0 });
      setOpenMs(performance.now() - t0);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    } catch (e) {
      setError(String(e));
      setLayout(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Пересчёт видимого окна. Меняется раз в ROW_H пикселей скролла, а не каждый кадр.
  const recomputeWindow = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !layout) return;
    const top = el.scrollTop;
    const height = el.clientHeight || 1;
    const start = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
    const end = Math.min(layout.count, Math.ceil((top + height) / ROW_H) + OVERSCAN);
    setWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [layout]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    recomputeWindow();
    el.addEventListener('scroll', recomputeWindow, { passive: true });
    const ro = new ResizeObserver(recomputeWindow);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', recomputeWindow);
      ro.disconnect();
    };
  }, [recomputeWindow]);

  // Перерисовка графа только при смене окна.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    drawGraph(canvas, { layout, start: window_.start, end: window_.end, selected });
  }, [layout, window_, selected]);

  // Подтягивание метаданных страницами.
  useEffect(() => {
    if (!layout || window_.end <= window_.start) return;
    const firstPage = Math.floor(window_.start / PAGE);
    const lastPage = Math.floor((window_.end - 1) / PAGE);
    for (let page = firstPage; page <= lastPage; page++) {
      if (pendingRef.current.has(page)) continue;
      if (metaRef.current.has(page * PAGE)) continue;
      pendingRef.current.add(page);
      invoke<CommitView[]>('commit_range', { start: page * PAGE, len: PAGE })
        .then((items) => {
          for (const item of items) metaRef.current.set(item.index, item);
          forceRender((n) => n + 1);
        })
        .catch((e) => setError(String(e)))
        .finally(() => pendingRef.current.delete(page));
    }
  }, [layout, window_]);

  const rows = [];
  if (layout) {
    for (let i = window_.start; i < window_.end; i++) {
      const meta = metaRef.current.get(i);
      const colour = colourOf(layout.colours[i]);
      rows.push(
        <div
          key={i}
          className={`row${selected === i ? ' row-selected' : ''}`}
          style={{ top: i * ROW_H, backgroundColor: `${colour}1a` }}
          onClick={() => setSelected(i)}
        >
          <div className="labels">
            {(refsByCommit.get(i) ?? []).map((r) => (
              <span key={`${r.kind}-${r.name}`} className={`chip chip-${r.kind}`} title={r.name}>
                {r.is_head ? '✓ ' : ''}
                {r.name}
              </span>
            ))}
          </div>
          <div className="subject" title={meta?.subject}>
            {meta?.subject ?? '…'}
            {meta?.body ? <span className="body"> {meta.body.split('\n')[0]}</span> : null}
          </div>
          <div className="author">{meta?.author ?? ''}</div>
          <div className="when">{meta ? new Date(meta.time * 1000).toLocaleDateString() : ''}</div>
          <div className="hash">{meta ? meta.hash.slice(0, 7) : ''}</div>
        </div>,
      );
    }
  }

  const gw = layout ? graphWidth(layout.max_lane) : 0;

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
            {openMs !== null ? ` · всего с IPC ${openMs.toFixed(0)} мс` : ''}
            {layout.truncated ? ' · обрезано' : ''}
          </span>
        ) : null}
        {layout ? <span className="path">{layout.path}</span> : null}
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="scroll" ref={scrollRef}>
        {layout ? (
          <div className="content" style={{ height: layout.count * ROW_H }}>
            <canvas
              ref={canvasRef}
              className="graph"
              style={{ top: window_.start * ROW_H, width: gw }}
            />
            <div className="rows" style={{ ['--graph-w' as string]: `${gw}px` }}>
              {rows}
            </div>
          </div>
        ) : (
          <div className="empty">Выбери локальный репозиторий, чтобы посмотреть граф</div>
        )}
      </div>
    </div>
  );
}
