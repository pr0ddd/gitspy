import { colourOf, type LayoutView } from './types';

export const ROW_H = 26;
export const LANE_W = 18;
export const PAD_X = 14;
const NODE_R = 5;
const CORNER = 7;
const LINE_W = 2;

export const laneX = (lane: number): number => PAD_X + lane * LANE_W;

export const graphWidth = (maxLane: number): number => laneX(maxLane) + PAD_X;

type DrawArgs = {
  readonly layout: LayoutView;
  readonly start: number;
  readonly end: number;
  readonly selected: number | null;
};

/**
 * Рисует окно строк [start, end). Canvas лежит внутри прокручиваемого содержимого
 * и смещён на start * ROW_H, поэтому при скролле его двигает браузер, а перерисовка
 * нужна только при смене окна.
 */
export function drawGraph(canvas: HTMLCanvasElement, args: DrawArgs): void {
  const { layout, start, end, selected } = args;
  const rows = Math.max(0, end - start);
  const cssW = graphWidth(layout.max_lane);
  const cssH = rows * ROW_H;

  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.lineWidth = LINE_W;
  ctx.lineCap = 'round';

  const half = ROW_H / 2;

  // Сначала все линии, затем узлы — чтобы узлы лежали поверх.
  for (let i = start; i < end; i++) {
    const y = (i - start) * ROW_H + half;
    const from = layout.seg_offsets[i];
    const to = layout.seg_offsets[i + 1];

    for (let s = from; s < to; s++) {
      const kind = layout.seg_kind[s];
      const a = laneX(layout.seg_from[s]);
      const b = laneX(layout.seg_to[s]);
      ctx.strokeStyle = colourOf(layout.seg_colour[s]);
      ctx.beginPath();

      if (kind === 0) {
        // сквозной проход
        ctx.moveTo(a, y - half);
        ctx.lineTo(a, y + half);
      } else if (kind === 2) {
        // линия приходит сверху по дорожке `from` и втыкается в узел на `to`
        ctx.moveTo(a, y - half);
        ctx.arcTo(a, y, b, y, CORNER);
        ctx.lineTo(b, y);
      } else {
        // из узла на `from` линия уходит вбок на `to` и дальше вниз
        ctx.moveTo(a, y);
        ctx.arcTo(b, y, b, y + half, CORNER);
        ctx.lineTo(b, y + half);
      }
      ctx.stroke();
    }
  }

  for (let i = start; i < end; i++) {
    const y = (i - start) * ROW_H + half;
    const x = laneX(layout.lanes[i]);
    const colour = colourOf(layout.colours[i]);
    const isMerge = layout.kinds[i] === 1;

    ctx.beginPath();
    ctx.arc(x, y, isMerge ? NODE_R - 1 : NODE_R, 0, Math.PI * 2);
    if (i === selected) {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = LINE_W;
    } else {
      ctx.fillStyle = colour;
      ctx.fill();
    }
  }
}
