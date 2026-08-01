import { identicon } from './avatar';
import { colourOf, type LayoutView, type RefView } from './types';
import type { Minimap } from './view';

export const MINIMAP_W = 56;
export const HEADER_H = 26;
export const BRANCH_W = 210;
const PAD_X = 14;
const CORNER = 7;
/** Ребро, входящее в узел или выходящее из него. */
const EDGE_W = 2;
/** Сквозная вертикаль: тоньше и приглушённее — она фон, а не содержание. */
const THROUGH_W = 1.25;
const THROUGH_ALPHA = 0.72;
const CAP_W = 2;
/** Тень, отделяющая колонку веток от графа и прижатые узлы от линий. */
const SHADOW = 'rgba(0,0,0,0.55)';

/** Размеры зависят от режима: с аватарками строка выше и дорожки шире. */
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

const BG = '#12141a';
const BG_HEAD = '#171b23';
const FG = '#dde3ec';
const FG_DIM = '#8996a8';
const FG_FAINT = '#626d7d';
const ROW_LINE = 'rgba(255,255,255,0.035)';
const HOVER = 'rgba(255,255,255,0.05)';
const SELECT = 'rgba(255,255,255,0.10)';

/** Высота полосы горизонтальной прокрутки под колонкой графа. */
export const HSCROLL_H = 9;
/** Сколько места нужно колонкам справа от графа. */
const RIGHT_COLS_W = 620;
const GRAPH_MIN_W = 140;
const GRAPH_MAX_W = 760;

/** Ширина видимой части графа. Фиксирована: иначе на репозитории с тремя
 *  десятками веток граф съедает весь экран и мержи тянут горизонтали через
 *  всю ширину. Что не влезло — доступно горизонтальной прокруткой. */
export function graphViewWidth(width: number): number {
  const rest = listWidth(width) - BRANCH_W - RIGHT_COLS_W;
  return Math.max(GRAPH_MIN_W, Math.min(GRAPH_MAX_W, rest));
}

export const graphLeft = (): number => BRANCH_W;
export const graphRight = (width: number): number => BRANCH_W + graphViewWidth(width);

/** Полная ширина содержимого графа — сколько нужно, чтобы показать все дорожки. */
export const graphContentWidth = (m: Metrics, maxLane: number): number =>
  PAD_X * 2 + maxLane * m.laneW + (m.avatars ? m.nodeR * 2 : m.nodeR * 2);

export const maxScrollX = (m: Metrics, maxLane: number, width: number): number =>
  Math.max(0, graphContentWidth(m, maxLane) - graphViewWidth(width));

/** Позиция дорожки с учётом горизонтальной прокрутки. */
export const laneX = (m: Metrics, lane: number, scrollX: number): number =>
  BRANCH_W + PAD_X + lane * m.laneW - scrollX;

export type Meta = {
  readonly hash: string[];
  readonly author: string[];
  readonly email: string[];
  readonly time: number[];
  readonly subject: string[];
  readonly body: string[];
};

export type Frame = {
  readonly layout: LayoutView | null;
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

export function drawFrame(canvas: HTMLCanvasElement, frame: Frame): void {
  const { layout, meta, refsByCommit, metrics: m, scrollY, scrollX, hover, selected } = frame;
  const { width, height } = frame;

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
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  const listW = listWidth(width);
  const gLeft = graphLeft();
  const gRight = graphRight(width);
  const msgX = gRight + 12;
  const colHash = listW - 80;
  const colDate = colHash - 88;
  const colAuthor = colDate - 140;

  if (layout && layout.count > 0) {
    const first = Math.max(0, Math.floor(scrollY / m.rowH));
    // Смещение округляем до физического пикселя: дробная прокрутка с трекпада
    // иначе кладёт текст на нецелые координаты и он размывается.
    const shift = Math.round((HEADER_H - (scrollY - first * m.rowH)) * dpr) / dpr;
    const last = Math.min(layout.count, first + Math.ceil(contentHeight(height) / m.rowH) + 1);
    const half = m.rowH / 2;

    /** Узел, уехавший за край по горизонтали, прижимается к краю колонки —
     *  иначе на репозитории с тремя десятками веток половина коммитов просто
     *  исчезает из виду. */
    const pin = (x: number): number =>
      Math.max(gLeft + m.nodeR + 3, Math.min(gRight - m.nodeR - 3, x));

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, listW, height - HEADER_H);
    ctx.clip();

    // 1. Фон строки: наведение и выделение на всю ширину.
    for (let i = first; i < last; i++) {
      const y = shift + (i - first) * m.rowH;
      if (i === selected) {
        ctx.fillStyle = SELECT;
        ctx.fillRect(0, y, listW, m.rowH);
      } else if (i === hover) {
        ctx.fillStyle = HOVER;
        ctx.fillRect(0, y, listW, m.rowH);
      }
      ctx.fillStyle = ROW_LINE;
      ctx.fillRect(0, y + m.rowH - 1, listW, 1);
    }

    // Всё, что относится к графу, живёт внутри своей колонки.
    ctx.save();
    ctx.beginPath();
    ctx.rect(gLeft, HEADER_H, gRight - gLeft, height - HEADER_H);
    ctx.clip();

    // 2. Подсветка дорожки: от узла вправо до края колонки, с колпачком.
    for (let i = first; i < last; i++) {
      const y = shift + (i - first) * m.rowH;
      const colour = colourOf(layout.colours[i]);
      const x = pin(laneX(m, layout.lanes[i], scrollX));
      ctx.fillStyle = `${colour}26`;
      ctx.fillRect(x, y + 1, Math.max(0, gRight - x), m.rowH - 2);
      ctx.fillStyle = colour;
      ctx.fillRect(gRight - CAP_W, y + 1, CAP_W, m.rowH - 2);
    }

    // 3. Линии: ортогональные, со скруглением на повороте.
    //    Сквозные вертикали тоньше и тише рёбер — иначе граф читается как
    //    сплошная штриховка, в которой не найти, что куда входит.
    ctx.lineCap = 'round';
    for (let i = first; i < last; i++) {
      const y = shift + (i - first) * m.rowH + half;
      for (let s = layout.seg_offsets[i]; s < layout.seg_offsets[i + 1]; s++) {
        const kind = layout.seg_kind[s];
        const a = laneX(m, layout.seg_from[s], scrollX);
        const b = laneX(m, layout.seg_to[s], scrollX);
        if (Math.max(a, b) < gLeft - 40 || Math.min(a, b) > gRight + 40) continue;
        ctx.lineWidth = kind === 0 ? THROUGH_W : EDGE_W;
        ctx.globalAlpha = kind === 0 ? THROUGH_ALPHA : 1;
        ctx.strokeStyle = colourOf(layout.seg_colour[s]);
        ctx.beginPath();
        if (kind === 0) {
          ctx.moveTo(a, y - half);
          ctx.lineTo(a, y + half);
        } else if (kind === 2) {
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
    ctx.globalAlpha = 1;
    ctx.lineWidth = EDGE_W;

    // 4. Узлы поверх линий, с прижатием к краю.
    for (let i = first; i < last; i++) {
      const y = Math.round(shift + (i - first) * m.rowH + half);
      const natural = laneX(m, layout.lanes[i], scrollX);
      const x = pin(natural);
      const colour = colourOf(layout.colours[i]);

      // Прижатый узел кладём на подложку с тенью: иначе он теряется среди
      // линий, поверх которых оказался, и непонятно, что он не на своём месте.
      if (x !== natural) {
        ctx.save();
        ctx.shadowColor = SHADOW;
        ctx.shadowBlur = 6;
        ctx.fillStyle = BG;
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR + 3, 0, Math.PI * 2);
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
        ctx.lineWidth = EDGE_W;
      } else {
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
      }

      if (i === selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR + 2.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = EDGE_W;
      }
    }

    // Тень у левого края графа — отделяет его от колонки веток.
    const shade = ctx.createLinearGradient(gLeft, 0, gLeft + 10, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.45)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(gLeft, HEADER_H, 10, height - HEADER_H);

    ctx.restore(); // конец клипа колонки графа

    // 5. Выноски и бэйджи веток в левой колонке.
    ctx.textBaseline = 'middle';
    ctx.font = FONT_CHIP;
    for (let i = first; i < last; i++) {
      const labels = refsByCommit.get(i);
      if (!labels) continue;
      const y = Math.round(shift + (i - first) * m.rowH + half);
      const colour = colourOf(layout.colours[i]);
      const nodeX = pin(laneX(m, layout.lanes[i], scrollX));

      // Бэйджи прижаты к ЛЕВОМУ краю колонки, выноска тянется от них к узлу.
      let left = 12;
      for (const label of labels) {
        const text = label.is_head ? `✓ ${label.name}` : label.name;
        const fitted = fitText(ctx, text, 150);
        const w = ctx.measureText(fitted).width + 14;
        if (left + w > BRANCH_W - 14) break;
        ctx.fillStyle = label.kind === 0 ? '#2b5ea8' : label.kind === 1 ? '#44506b' : '#7a5c1e';
        roundRect(ctx, left, y - 9, w, 18, 3);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(fitted, left + 7, y);
        left += w + 4;
      }

      ctx.strokeStyle = colour;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left + 2, y + 0.5);
      ctx.lineTo(nodeX - m.nodeR - 2, y + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = EDGE_W;
    }

    // 6. Текст строки.
    for (let i = first; i < last; i++) {
      const yc = Math.round(shift + (i - first) * m.rowH + half);
      ctx.font = m.font;

      const subject = meta.subject[i];
      if (subject === undefined) {
        ctx.fillStyle = FG_FAINT;
        ctx.fillText('—', msgX, yc);
        continue;
      }

      const subjMax = colAuthor - msgX - 12;
      ctx.fillStyle = FG;
      const fitted = fitText(ctx, subject, subjMax);
      ctx.fillText(fitted, msgX, yc);

      const body = meta.body[i];
      if (body && fitted === subject) {
        const used = ctx.measureText(subject).width;
        const rest = subjMax - used - 10;
        if (rest > 20) {
          ctx.fillStyle = FG_FAINT;
          ctx.fillText(fitText(ctx, body.split('\n')[0], rest), msgX + used + 10, yc);
        }
      }

      ctx.fillStyle = FG_DIM;
      ctx.fillText(fitText(ctx, meta.author[i] ?? '', colDate - colAuthor - 10), colAuthor, yc);
      ctx.fillText(dateFmt.format(new Date(meta.time[i] * 1000)), colDate, yc);
      ctx.font = m.fontMono;
      ctx.fillText(meta.hash[i]?.slice(0, 7) ?? '', colHash, yc);
    }

    ctx.restore();
    drawHScroll(ctx, frame, gLeft, gRight);
  }

  drawHeader(ctx, listW, gLeft, gRight, msgX, colAuthor, colDate, colHash);
  drawMinimap(ctx, frame, listW);
}

/** Горизонтальная прокрутка графа — отдельная полоса под его колонкой. */
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
  const thumbW = Math.max(30, (trackW / content) * trackW);
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
): void {
  ctx.fillStyle = BG_HEAD;
  ctx.fillRect(0, 0, listW, HEADER_H);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, HEADER_H - 1, listW, 1);

  ctx.font = FONT_HEAD;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = FG_DIM;
  const y = Math.round(HEADER_H / 2);
  ctx.fillText('ВЕТКА / ТЕГ', 12, y);
  ctx.fillText('ГРАФ', gLeft + 6, y);
  ctx.fillText('СООБЩЕНИЕ', msgX, y);
  ctx.fillText('АВТОР', colAuthor, y);
  ctx.fillText('ДАТА', colDate, y);
  ctx.fillText('ХЕШ', colHash, y);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (const x of [gLeft, gRight]) ctx.fillRect(x, 0, 1, HEADER_H);
}

function drawMinimap(ctx: CanvasRenderingContext2D, frame: Frame, listW: number): void {
  const { minimap, layout, scrollY, height, width, metrics } = frame;
  if (!minimap || !layout) return;

  const x0 = listW;
  ctx.fillStyle = '#0e1015';
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
      ctx.fillStyle = colourOf(lane);
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
