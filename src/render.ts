import { identicon } from './avatar';
import { SEGMENT_KIND, type LayoutView, type RefView } from './types';
import { laneColour, laneColourAlpha, theme } from './theme';
import type { Minimap } from './view';

export const MINIMAP_W = 56;
export const HEADER_H = 26;
export const BRANCH_W = 210;
const PAD_X = 14;
const CORNER = 7;

const GRAPH_W = 2;

const LEADER_W = 1;
const LEADER_ALPHA = 0.18;
const CAP_W = 2;

const SHADOW_BAND = 14;

export type Metrics = {
  readonly rowH: number;
  readonly laneW: number;
  readonly nodeR: number;
  readonly avatars: boolean;
  readonly font: string;
  readonly fontMono: string;
};

export const METRICS_AVATARS: Metrics = {
  rowH: 30,
  laneW: 24,
  nodeR: 10,
  avatars: true,
  font: '13px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  fontMono: '12px ui-monospace, SFMono-Regular, Menlo, monospace',
};

export const METRICS_COMPACT: Metrics = {
  rowH: 22,
  laneW: 14,
  nodeR: 4.5,
  avatars: false,
  font: '12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  fontMono: '11px ui-monospace, SFMono-Regular, Menlo, monospace',
};

const FONT_CHIP = '11px ui-sans-serif, system-ui, sans-serif';
const FONT_HEAD = '10px ui-sans-serif, system-ui, sans-serif';


export const HSCROLL_H = 9;

const RIGHT_COLS_W = 620;
const GRAPH_MIN_W = 140;
const GRAPH_MAX_W = 760;

export function graphViewWidth(width: number): number {
  const rest = listWidth(width) - BRANCH_W - RIGHT_COLS_W;
  return Math.max(GRAPH_MIN_W, Math.min(GRAPH_MAX_W, rest));
}

export const graphLeft = (): number => BRANCH_W;
export const graphRight = (width: number): number => BRANCH_W + graphViewWidth(width);

export const graphContentWidth = (m: Metrics, maxLane: number): number =>
  PAD_X * 2 + maxLane * m.laneW + (m.avatars ? m.nodeR * 2 : m.nodeR * 2);

export const pinWidth = (m: Metrics): number => m.nodeR * 2 + 10;

export const graphScrollable = (m: Metrics, maxLane: number, width: number): boolean =>
  graphContentWidth(m, maxLane) > graphViewWidth(width);

export const maxScrollX = (m: Metrics, maxLane: number, width: number): number => {
  if (!graphScrollable(m, maxLane, width)) return 0;

  return graphContentWidth(m, maxLane) - (graphViewWidth(width) - 2 * pinWidth(m));
};

export type Meta = {
  readonly hash: string[];
  readonly author: string[];
  readonly email: string[];
  readonly time: number[];
  readonly subject: string[];
  readonly body: string[];
};

export type Columns = {
  readonly branchTag: string;
  readonly graph: string;
  readonly message: string;
  readonly author: string;
  readonly date: string;
  readonly sha: string;
};

export type Frame = {
  readonly layout: LayoutView | null;
  readonly columns: Columns;
  readonly meta: Meta;
  readonly refsByCommit: ReadonlyMap<number, RefView[]>;
  readonly minimap: Minimap | null;
  readonly metrics: Metrics;
  readonly scrollY: number;
  readonly scrollX: number;
  readonly hover: number | null;
  readonly selected: number | null;
  readonly width: number;
  readonly height: number;
};

const dateFmt = new Intl.DateTimeFormat('ru', { day: '2-digit', month: '2-digit', year: 'numeric' });

const clipCache = new Map<string, string>();

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (max <= 0) return '';
  const key = `${text} ${Math.round(max)} ${ctx.font}`;
  const cached = clipCache.get(key);
  if (cached !== undefined) return cached;

  let out = text;
  if (ctx.measureText(text).width > max) {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(`${text.slice(0, mid)}…`).width <= max) lo = mid;
      else hi = mid - 1;
    }
    out = lo > 0 ? `${text.slice(0, lo)}…` : '';
  }
  if (clipCache.size > 20000) clipCache.clear();
  clipCache.set(key, out);
  return out;
}

export const listWidth = (width: number): number => width - MINIMAP_W;
export const contentHeight = (height: number): number => Math.max(0, height - HEADER_H);

export function rowAtY(m: Metrics, y: number, scrollY: number, count: number): number | null {
  if (y < HEADER_H) return null;
  const index = Math.floor((y - HEADER_H + scrollY) / m.rowH);
  return index >= 0 && index < count ? index : null;
}

export function maxScroll(m: Metrics, count: number, viewportH: number): number {
  return Math.max(0, count * m.rowH - contentHeight(viewportH));
}

type GraphGeometry = {
  readonly gLeft: number;
  readonly gRight: number;

  readonly leftShadow: boolean;
  readonly rightShadow: boolean;

  readonly laneAt: (lane: number) => number;

  readonly contentLeft: number;
  readonly contentRight: number;

  readonly nodeX: (lane: number) => number;
  readonly isStuck: (lane: number) => boolean;
};

function graphGeometry(
  m: Metrics,
  maxLane: number,
  scrollX: number,
  width: number,
): GraphGeometry {
  const gLeft = graphLeft();
  const gRight = graphRight(width);
  const pinW = pinWidth(m);
  const scrollable = graphScrollable(m, maxLane, width);

  const contentLeft = gLeft + (scrollable ? pinW : 0);
  const contentRight = gRight - (scrollable ? pinW : 0);

  const lo = gLeft + pinW / 2;
  const hi = gRight - pinW / 2;
  const maxX = maxScrollX(m, maxLane, width);
  const laneAt = (lane: number): number => contentLeft + PAD_X + lane * m.laneW - scrollX;
  return {
    gLeft,
    gRight,
    leftShadow: scrollX > 0.5,
    rightShadow: scrollX < maxX - 0.5,
    contentLeft,
    contentRight,
    laneAt,
    nodeX: (lane) => (scrollable ? Math.max(lo, Math.min(hi, laneAt(lane))) : laneAt(lane)),
    isStuck: (lane) => {
      if (!scrollable) return false;
      const n = laneAt(lane);
      return n < lo || n > hi;
    },
  };
}

export function drawFrame(canvas: HTMLCanvasElement, frame: Frame): void {
  const { layout, meta, refsByCommit, metrics: m, scrollY, scrollX, hover, selected } = frame;
  const { width, height } = frame;

  const t = theme();
  const dpr = window.devicePixelRatio || 1;
  const wantW = Math.round(width * dpr);
  const wantH = Math.round(height * dpr);
  if (canvas.width !== wantW || canvas.height !== wantH) {
    canvas.width = wantW;
    canvas.height = wantH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = t.surface;
  ctx.fillRect(0, 0, width, height);

  const listW = listWidth(width);
  const g = layout
    ? graphGeometry(m, layout.max_lane, scrollX, width)
    : graphGeometry(m, 0, 0, width);
  const msgX = g.gRight + 12;
  const colHash = listW - 80;
  const colDate = colHash - 88;
  const colAuthor = colDate - 140;

  if (layout && layout.count > 0) {
    const first = Math.max(0, Math.floor(scrollY / m.rowH));

    const shift = Math.round((HEADER_H - (scrollY - first * m.rowH)) * dpr) / dpr;
    const last = Math.min(layout.count, first + Math.ceil(contentHeight(height) / m.rowH) + 1);
    const half = m.rowH / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, listW, height - HEADER_H);
    ctx.clip();

    for (let i = first; i < last; i++) {
      const y = shift + (i - first) * m.rowH;
      if (i === selected) {
        ctx.fillStyle = t.rowSelected;
        ctx.fillRect(0, y, listW, m.rowH);
      } else if (i === hover) {
        ctx.fillStyle = t.rowHover;
        ctx.fillRect(0, y, listW, m.rowH);
      }

      ctx.fillStyle = t.rowLine;
      ctx.fillRect(g.gRight, y + m.rowH - 1, listW - g.gRight, 1);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(g.gLeft, HEADER_H, g.gRight - g.gLeft, height - HEADER_H);
    ctx.clip();

    for (let i = first; i < last; i++) {
      const y = shift + (i - first) * m.rowH;
      const x = g.nodeX(layout.lanes[i]) - m.nodeR;
      ctx.fillStyle = laneColourAlpha(layout.colours[i], 11);
      ctx.fillRect(x, y + 1, Math.max(0, g.gRight - x), m.rowH - 2);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      g.contentLeft,
      HEADER_H,
      Math.max(0, g.contentRight - g.contentLeft),
      height - HEADER_H,
    );
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineWidth = GRAPH_W;
    for (let i = first; i < last; i++) {
      const y = shift + (i - first) * m.rowH + half;
      for (let s = layout.seg_offsets[i]; s < layout.seg_offsets[i + 1]; s++) {
        const kind = layout.seg_kind[s];
        const a = g.laneAt(layout.seg_from[s]);
        const b = g.laneAt(layout.seg_to[s]);
        if (Math.max(a, b) < g.contentLeft - 40 || Math.min(a, b) > g.contentRight + 40) continue;
        ctx.strokeStyle = laneColour(layout.seg_colour[s]);
        ctx.beginPath();
        if (kind === SEGMENT_KIND.through) {
          ctx.moveTo(a, y - half);
          ctx.lineTo(a, y + half);
        } else if (kind === SEGMENT_KIND.merge) {
          ctx.moveTo(a, y - half);
          ctx.arcTo(a, y, b, y, CORNER);
          ctx.lineTo(b, y);
        } else {
          ctx.moveTo(a, y);
          ctx.arcTo(b, y, b, y + half, CORNER);
          ctx.lineTo(b, y + half);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    if (g.leftShadow) {
      const sh = ctx.createLinearGradient(g.contentLeft, 0, g.contentLeft + SHADOW_BAND, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.55)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(g.contentLeft, HEADER_H, SHADOW_BAND, height - HEADER_H);
    }
    if (g.rightShadow) {
      const sh = ctx.createLinearGradient(g.contentRight, 0, g.contentRight - SHADOW_BAND, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.55)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(g.contentRight - SHADOW_BAND, HEADER_H, SHADOW_BAND, height - HEADER_H);
    }

    for (let i = first; i < last; i++) {
      const y = shift + (i - first) * m.rowH;
      ctx.fillStyle = laneColour(layout.colours[i]);
      ctx.fillRect(g.gRight - CAP_W, y + 1, CAP_W, m.rowH - 2);
    }

    for (let i = first; i < last; i++) {
      const y = Math.round(shift + (i - first) * m.rowH + half);
      const lane = layout.lanes[i];
      const x = g.nodeX(lane);
      const colour = laneColour(layout.colours[i]);

      if (g.isStuck(lane)) {

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 5;
        ctx.fillStyle = t.surface;
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR + 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (m.avatars) {
        const key = meta.email[i] || meta.author[i] || String(i);
        const size = m.nodeR * 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(identicon(key, size), x - m.nodeR, y - m.nodeR, size, size);
        ctx.restore();
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
      }

      if (i === selected) {
        ctx.strokeStyle = t.surface;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = GRAPH_W;
    }

    ctx.restore();

    ctx.textBaseline = 'middle';
    ctx.font = FONT_CHIP;
    for (let i = first; i < last; i++) {
      const labels = refsByCommit.get(i);
      if (!labels) continue;
      const y = Math.round(shift + (i - first) * m.rowH + half);
      const colour = laneColour(layout.colours[i]);
      const nodeX = g.nodeX(layout.lanes[i]);

      let left = 12;

      let chipEnd = left;
      for (const label of labels) {
        const text = label.is_head ? `✓ ${label.name}` : label.name;
        const fitted = fitText(ctx, text, 150);
        const w = ctx.measureText(fitted).width + 14;
        if (left + w > BRANCH_W - 14) break;
        ctx.fillStyle = theme().ref[label.kind];
        roundRect(ctx, left, y - 9, w, 18, 3);
        ctx.fill();
        ctx.fillStyle = t.foreground;
        ctx.fillText(fitted, left + 7, y);
        chipEnd = left + w;
        left = chipEnd + 4;
      }

      ctx.strokeStyle = colour;
      ctx.globalAlpha = LEADER_ALPHA;
      ctx.lineWidth = LEADER_W;
      ctx.beginPath();
      ctx.moveTo(chipEnd, y + 0.5);
      ctx.lineTo(nodeX - m.nodeR, y + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = GRAPH_W;
    }

    for (let i = first; i < last; i++) {
      const yc = Math.round(shift + (i - first) * m.rowH + half);
      ctx.font = m.font;

      const subject = meta.subject[i];
      if (subject === undefined) {
        ctx.fillStyle = t.faint;
        ctx.fillText('—', msgX, yc);
        continue;
      }

      const subjMax = colAuthor - msgX - 12;
      ctx.fillStyle = t.foreground;
      const fitted = fitText(ctx, subject, subjMax);
      ctx.fillText(fitted, msgX, yc);

      const body = meta.body[i];
      if (body && fitted === subject) {
        const used = ctx.measureText(subject).width;
        const rest = subjMax - used - 10;
        if (rest > 20) {
          ctx.fillStyle = t.faint;
          ctx.fillText(fitText(ctx, body.split('\n')[0], rest), msgX + used + 10, yc);
        }
      }

      ctx.fillStyle = t.muted;
      ctx.fillText(fitText(ctx, meta.author[i] ?? '', colDate - colAuthor - 10), colAuthor, yc);
      ctx.fillText(dateFmt.format(new Date(meta.time[i] * 1000)), colDate, yc);
      ctx.font = m.fontMono;
      ctx.fillText(meta.hash[i]?.slice(0, 7) ?? '', colHash, yc);
    }

    ctx.restore();
    drawHScroll(ctx, frame, g.gLeft, g.gRight);
  }

  drawHeader(ctx, listW, g.gLeft, g.gRight, msgX, colAuthor, colDate, colHash, frame.columns);
  drawMinimap(ctx, frame, listW);
}

function drawHScroll(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  gLeft: number,
  gRight: number,
): void {
  const { layout, metrics: m, scrollX, width, height } = frame;
  if (!layout) return;
  const max = maxScrollX(m, layout.max_lane, width);
  if (max <= 0) return;

  const trackW = gRight - gLeft;
  const y = height - HSCROLL_H;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(gLeft, y, trackW, HSCROLL_H);

  const content = graphContentWidth(m, layout.max_lane);
  const visible = graphViewWidth(width) - 2 * pinWidth(m);
  const thumbW = Math.max(30, (visible / content) * trackW);
  const thumbX = gLeft + (scrollX / max) * (trackW - thumbW);
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  roundRect(ctx, thumbX, y + 2, thumbW, HSCROLL_H - 4, (HSCROLL_H - 4) / 2);
  ctx.fill();
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  listW: number,
  gLeft: number,
  gRight: number,
  msgX: number,
  colAuthor: number,
  colDate: number,
  colHash: number,
  columns: Columns,
): void {
  const t = theme();
  ctx.fillStyle = t.surfaceRaised;
  ctx.fillRect(0, 0, listW, HEADER_H);
  ctx.fillStyle = t.border;
  ctx.fillRect(0, HEADER_H - 1, listW, 1);

  ctx.font = FONT_HEAD;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.muted;
  const y = Math.round(HEADER_H / 2);
  ctx.fillText(columns.branchTag, 12, y);
  ctx.fillText(columns.graph, gLeft + 6, y);
  ctx.fillText(columns.message, msgX, y);
  ctx.fillText(columns.author, colAuthor, y);
  ctx.fillText(columns.date, colDate, y);
  ctx.fillText(columns.sha, colHash, y);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (const x of [gLeft, gRight]) ctx.fillRect(x, 0, 1, HEADER_H);
}

function drawMinimap(ctx: CanvasRenderingContext2D, frame: Frame, listW: number): void {
  const { minimap, layout, scrollY, height, width, metrics } = frame;
  if (!minimap || !layout) return;

  const x0 = listW;
  ctx.fillStyle = theme().surface;
  ctx.fillRect(x0, 0, width - x0, height);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x0, 0, 1, height);

  const inner = MINIMAP_W - 8;
  const laneW = Math.max(1.5, Math.min(4, inner / (minimap.maxLane + 1)));

  for (let b = 0; b < minimap.buckets; b++) {
    const mask = minimap.bits[b];
    if (mask === 0) continue;
    for (let lane = 0; lane <= minimap.maxLane; lane++) {
      if ((mask & (1 << lane)) === 0) continue;
      ctx.fillStyle = laneColour(lane);
      ctx.fillRect(x0 + 4 + lane * laneW, b, Math.max(1, laneW - 0.5), 1);
    }
  }

  const total = layout.count * metrics.rowH;
  const visible = contentHeight(height);
  if (total > visible) {
    const top = (scrollY / total) * height;
    const h = Math.max(6, (visible / total) * height);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x0, top, width - x0, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, top + 0.5, width - x0 - 1, h - 1);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
