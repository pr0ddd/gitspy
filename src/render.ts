import { identicon } from './avatar';
import {
  contentHeight,
  graphContentWidth,
  graphGeometry,
  graphLeft,
  graphRight,
  graphViewWidth,
  HEADER_H,
  HSCROLL_H,
  listWidth,
  maxScroll,
  maxScrollX,
  METRICS_AVATARS,
  METRICS_COMPACT,
  MINIMAP_W,
  pinWidth,
  rowAtY,
  visibleRange,
  hashColumnLeft,
  BRANCH_W,
  type Metrics,
} from './scene';

export {
  contentHeight,
  graphLeft,
  graphRight,
  HEADER_H,
  HSCROLL_H,
  listWidth,
  maxScroll,
  maxScrollX,
  METRICS_AVATARS,
  METRICS_COMPACT,
  MINIMAP_W,
  rowAtY,
  BRANCH_W,
  type Metrics,
};
import { SEGMENT_KIND, type RefView, type RepoView, type RowView } from './types';
import type { RowCache } from './rows';
import { laneColour, laneColourAlpha, theme } from './theme';
import type { Minimap } from './view';

const CORNER = 7;

const GRAPH_W = 2;

const LEADER_W = 1;
const LEADER_ALPHA = 0.18;
const CAP_W = 2;

const SHADOW_BAND = 14;

const FONT_CHIP = '11px ui-sans-serif, system-ui, sans-serif';
const FONT_HEAD = '10px ui-sans-serif, system-ui, sans-serif';


export type Columns = {
  readonly branchTag: string;
  readonly graph: string;
  readonly message: string;
  readonly author: string;
  readonly date: string;
  readonly sha: string;
};

export type Frame = {
  readonly repo: RepoView | null;
  readonly rows: RowCache;
  readonly columns: Columns;
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

const avatarKey = (row: RowView, index: number): string =>
  row.kind === 'commit' ? row.email || row.author || String(index) : 'working-tree';

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

export function drawFrame(canvas: HTMLCanvasElement, frame: Frame): void {
  const { repo, rows, refsByCommit, metrics: m, scrollY, scrollX, hover, selected } = frame;
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
  const g = repo
    ? graphGeometry(m, repo.maxLane, scrollX, width)
    : graphGeometry(m, 0, 0, width);
  const msgX = g.gRight + 12;
  const colHash = hashColumnLeft(width);
  const colDate = colHash - 88;
  const colAuthor = colDate - 140;

  if (repo && repo.count > 0) {
    const { first, last, shift } = visibleRange(m, scrollY, height, repo.count, dpr);
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
      const row = rows.row(i);
      if (!row) continue;
      const x = g.nodeX(row.lane) - m.nodeR;
      ctx.fillStyle = laneColourAlpha(row.colour, 11);
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

    const byColour = new Map<number, Path2D>();
    for (let i = first; i < last; i++) {
      const y = shift + (i - first) * m.rowH + half;
      const found = rows.segments(i);
      if (!found) continue;
      const w = found.window;
      for (let s = found.from; s < found.to; s++) {
        const kind = w.segKind[s];
        const a = g.laneAt(w.segFrom[s]);
        const b = g.laneAt(w.segTo[s]);
        if (Math.max(a, b) < g.contentLeft - 40 || Math.min(a, b) > g.contentRight + 40) continue;

        const colour = w.segColour[s];
        let path = byColour.get(colour);
        if (!path) {
          path = new Path2D();
          byColour.set(colour, path);
        }
        if (kind === SEGMENT_KIND.through) {
          path.moveTo(a, y - half);
          path.lineTo(a, y + half);
        } else if (kind === SEGMENT_KIND.merge) {
          path.moveTo(a, y - half);
          path.arcTo(a, y, b, y, CORNER);
          path.lineTo(b, y);
        } else {
          path.moveTo(a, y);
          path.arcTo(b, y, b, y + half, CORNER);
          path.lineTo(b, y + half);
        }
      }
    }

    for (const [colour, path] of byColour) {
      ctx.strokeStyle = laneColour(colour);
      ctx.stroke(path);
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
      const row = rows.row(i);
      if (!row) continue;
      const y = shift + (i - first) * m.rowH;
      ctx.fillStyle = laneColour(row.colour);
      ctx.fillRect(g.gRight - CAP_W, y + 1, CAP_W, m.rowH - 2);
    }

    for (let i = first; i < last; i++) {
      const row = rows.row(i);
      if (!row) continue;
      const y = Math.round(shift + (i - first) * m.rowH + half);
      const lane = row.lane;
      const x = g.nodeX(lane);
      const colour = laneColour(row.colour);

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
        const key = avatarKey(row, i);
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
      const row = rows.row(i);
      if (!row) continue;
      const y = Math.round(shift + (i - first) * m.rowH + half);
      const colour = laneColour(row.colour);
      const nodeX = g.nodeX(row.lane);

      let left = 12;

      let chipEnd = left;
      for (const label of labels) {
        const text = label.isHead ? `✓ ${label.name}` : label.name;
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

      const row = rows.row(i);
      if (!row || row.kind !== 'commit') {
        ctx.fillStyle = t.faint;
        ctx.fillText('—', msgX, yc);
        continue;
      }
      const subject = row.subject;

      const subjMax = colAuthor - msgX - 12;
      ctx.fillStyle = t.foreground;
      const fitted = fitText(ctx, subject, subjMax);
      ctx.fillText(fitted, msgX, yc);

      const body = row.body;
      if (body && fitted === subject) {
        const used = ctx.measureText(subject).width;
        const rest = subjMax - used - 10;
        if (rest > 20) {
          ctx.fillStyle = t.faint;
          ctx.fillText(fitText(ctx, body.split('\n')[0], rest), msgX + used + 10, yc);
        }
      }

      ctx.fillStyle = t.muted;
      ctx.fillText(fitText(ctx, row.author, colDate - colAuthor - 10), colAuthor, yc);
      ctx.fillText(dateFmt.format(new Date(row.time * 1000)), colDate, yc);
      ctx.font = m.fontMono;
      ctx.fillText(row.hash.slice(0, 7), colHash, yc);
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
  const { repo, metrics: m, scrollX, width, height } = frame;
  if (!repo) return;
  const max = maxScrollX(m, repo.maxLane, width);
  if (max <= 0) return;

  const trackW = gRight - gLeft;
  const y = height - HSCROLL_H;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(gLeft, y, trackW, HSCROLL_H);

  const content = graphContentWidth(m, repo.maxLane);
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
  const { minimap, repo, scrollY, height, width, metrics } = frame;
  if (!minimap || !repo) return;

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
      ctx.fillStyle = laneColour(repo.minimapColours[lane] ?? lane);
      ctx.fillRect(x0 + 4 + lane * laneW, b, Math.max(1, laneW - 0.5), 1);
    }
  }

  const total = repo.count * metrics.rowH;
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
