import { laneColour, laneColourAlpha } from '@/shared/ui/theme';
import type { Metrics } from '../scene';
import type { Pass } from './frame';

const CAP_W = 2;
const BAND_TINT = 11;
const BAND_TINT_HOVER = 18;
const BAND_TINT_SELECTED = 50;

const rowCap = (m: Metrics, band: number): number => Math.min(band / 2, m.nodeR + 1);

function traceRowBand(
  ctx: CanvasRenderingContext2D,
  m: Metrics,
  nodeX: number,
  cap: number,
  top: number,
  band: number,
  right: number,
): void {
  const bottom = top + band;
  if (!m.avatars) {
    ctx.beginPath();
    ctx.rect(nodeX, top, Math.max(0, right - nodeX), band);
    return;
  }
  const left = nodeX - cap;
  ctx.beginPath();
  ctx.moveTo(left + cap, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, bottom);
  ctx.lineTo(left + cap, bottom);
  ctx.arcTo(left, bottom, left, bottom - cap, cap);
  ctx.lineTo(left, top + cap);
  ctx.arcTo(left, top, left + cap, top, cap);
  ctx.closePath();
}

export function drawRowHighlights({
  ctx,
  frame,
  t,
  m,
  g,
  listW,
  first,
  last,
  shift,
  inset,
  band,
}: Pass): void {
  const { rows, hover, selected } = frame;
  for (let i = first; i < last; i++) {
    const y = shift + (i - first) * m.rowH;
    if (i === selected || i === hover) {
      ctx.fillStyle = i === selected ? t.rowSelected : t.rowHover;
      const capX = g.nodeX(rows.row(i)?.lane ?? 0);
      traceRowBand(ctx, m, capX, rowCap(m, band), y + inset, band, listW);
      ctx.fill();
    }
  }
}

export function drawLaneBands({ ctx, frame, m, g, first, last, shift, inset, band }: Pass): void {
  const { rows, hover, selected } = frame;
  for (let i = first; i < last; i++) {
    const y = shift + (i - first) * m.rowH;
    const row = rows.row(i);
    if (!row) continue;
    const x = g.nodeX(row.lane);
    const tint = i === selected ? BAND_TINT_SELECTED : i === hover ? BAND_TINT_HOVER : BAND_TINT;
    ctx.fillStyle = laneColourAlpha(row.colour, tint);
    traceRowBand(ctx, m, x, rowCap(m, band), y + inset, band, g.gRight);
    ctx.fill();
  }
}

export function drawLaneCaps({ ctx, frame, m, g, first, last, shift, inset, band }: Pass): void {
  const { rows } = frame;
  for (let i = first; i < last; i++) {
    const row = rows.row(i);
    if (!row) continue;
    const y = shift + (i - first) * m.rowH;
    ctx.fillStyle = laneColour(row.colour);
    ctx.fillRect(g.gRight - CAP_W, y + inset, CAP_W, band);
  }
}
