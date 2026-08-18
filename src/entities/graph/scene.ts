import { FLOORS, type Cols } from './columns';

export const MINIMAP_W = 36;
export const VSCROLL_W = 14;
export const HEADER_H = 32;
export const HSCROLL_H = 9;

export const GRAPH_INSET = 18;
const PAD_X = GRAPH_INSET;

export type Metrics = {
  readonly rowH: number;
  readonly bandH: number;
  readonly laneW: number;
  readonly lineW: number;
  readonly nodeR: number;
  readonly avatars: boolean;
  readonly fontPx: number;
  readonly font: string;
  readonly fontDetail: string;
  readonly fontMono: string;
};

const SANS = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;

const fonts = (px: number, detailPx: number) => ({
  fontPx: px,
  font: `450 ${px}px ${SANS}`,
  fontDetail: `350 ${detailPx}px ${SANS}`,
  fontMono: `350 ${detailPx}px ${SANS}`,
});

export const METRICS_AVATARS: Metrics = {
  rowH: 28,
  bandH: 22,
  laneW: 24,
  lineW: 2,
  nodeR: 10,
  avatars: true,
  ...fonts(13, 12),
};

export const METRICS_COMPACT: Metrics = {
  rowH: 28,
  bandH: 22,
  laneW: 16,
  lineW: 1,
  nodeR: 5,
  avatars: false,
  ...fonts(12, 11),
};

export const rowBandInset = (m: Metrics): number => (m.rowH - m.bandH) / 2;

export const rowBandHeight = (m: Metrics): number => m.bandH;

export const listTopInset = (m: Metrics): number => rowBandInset(m);

export const listWidth = (width: number, minimap = true): number =>
  width - (minimap ? MINIMAP_W : VSCROLL_W);

export const contentHeight = (height: number): number => Math.max(0, height - HEADER_H);

export const graphContentWidth = (m: Metrics, maxLane: number): number =>
  PAD_X * 2 + maxLane * m.laneW + m.nodeR * 2;

export const pinWidth = (m: Metrics): number => m.nodeR * 2 + 10;

export const graphScrollable = (m: Metrics, maxLane: number, graphW: number): boolean =>
  graphContentWidth(m, maxLane) > graphW;

export const maxScrollX = (m: Metrics, maxLane: number, graphW: number): number => {
  if (!graphScrollable(m, maxLane, graphW)) return 0;
  return graphContentWidth(m, maxLane) - (graphW - 2 * pinWidth(m));
};

export const maxScroll = (m: Metrics, count: number, viewportH: number): number =>
  Math.max(0, listTopInset(m) + count * m.rowH - contentHeight(viewportH));

export function scrollToReveal(
  m: Metrics,
  index: number,
  scrollY: number,
  height: number,
  count: number,
): number {
  const band = contentHeight(height);
  const top = index === 0 ? 0 : listTopInset(m) + index * m.rowH;
  const bottom = listTopInset(m) + (index + 1) * m.rowH;
  const limit = maxScroll(m, count, height);

  if (top < scrollY) return Math.max(0, Math.min(top, limit));
  if (bottom > scrollY + band) return Math.max(0, Math.min(bottom - band, limit));
  return scrollY;
}

export function scrollToCenter(
  m: Metrics,
  index: number,
  current: number,
  viewportH: number,
  count: number,
): number {
  const top = listTopInset(m) + index * m.rowH;
  const view = contentHeight(viewportH);
  if (top >= current && top + m.rowH <= current + view) return current;
  const centred = top - (view - m.rowH) / 2;
  return Math.max(0, Math.min(centred, maxScroll(m, count, viewportH)));
}

export function rowAtY(m: Metrics, y: number, scrollY: number, count: number): number | null {
  if (y < HEADER_H) return null;
  const index = Math.floor((y - HEADER_H - listTopInset(m) + scrollY) / m.rowH);
  return index >= 0 && index < count ? index : null;
}

export type VisibleRange = {
  readonly first: number;
  readonly last: number;
  readonly shift: number;
};

export function visibleRange(
  m: Metrics,
  scrollY: number,
  height: number,
  count: number,
  dpr = 1,
): VisibleRange {
  const first = Math.max(0, Math.floor((scrollY - listTopInset(m)) / m.rowH));
  const shift = Math.round((HEADER_H + listTopInset(m) + first * m.rowH - scrollY) * dpr) / dpr;
  const last = Math.min(count, first + Math.ceil(contentHeight(height) / m.rowH) + 1);
  return { first, last, shift };
}

export type GraphGeometry = {
  readonly gLeft: number;
  readonly gRight: number;
  readonly pinX: number;
  readonly singleColumn: number;
  readonly edgeAlpha: number;
  readonly leftShade: number;
  readonly rightShade: number;
  readonly laneAt: (lane: number) => number;
  readonly contentLeft: number;
  readonly contentRight: number;
  readonly nodeX: (lane: number) => number;
  readonly isStuck: (lane: number) => boolean;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const mix = (from: number, to: number, share: number): number => from + (to - from) * share;

export const singleColumnFactor = (m: Metrics, maxLane: number, graphW: number): number =>
  maxLane === 0 ? 0 : clamp01(1 - (graphW - FLOORS.graph) / m.laneW);

export function graphGeometry(
  m: Metrics,
  maxLane: number,
  scrollX: number,
  cols: Cols,
): GraphGeometry {
  const gLeft = cols.graph.left;
  const gRight = cols.graph.left + cols.graph.width;

  const pinW = pinWidth(m);
  const scrollable = graphScrollable(m, maxLane, cols.graph.width);
  const single = singleColumnFactor(m, maxLane, cols.graph.width);

  const contentLeft = gLeft + (scrollable ? pinW : 0);
  const contentRight = gRight - (scrollable ? pinW : 0);

  const rest = gLeft + PAD_X - 0.5;
  const edge = Math.max(rest, gRight - m.nodeR - 4.5);
  const centre = gLeft + cols.graph.width / 2;
  const hi = mix(edge, centre, single);
  const lo = mix(Math.min(rest, edge), centre, single);
  const maxX = maxScrollX(m, maxLane, cols.graph.width);
  const laneAt = (lane: number): number => gLeft + PAD_X + lane * m.laneW - scrollX;

  const hiddenLeft = scrollX > 0.5 ? clamp01(scrollX / m.laneW) : 0;
  const hiddenRight = scrollX < maxX - 0.5 ? 1 : 0;

  return {
    gLeft,
    gRight,
    pinX: scrollable ? hi : Number.POSITIVE_INFINITY,
    singleColumn: single,
    edgeAlpha: 1 - single,
    leftShade: hiddenLeft * (1 - single),
    rightShade: hiddenRight * (1 - single),
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

export type NodeHit = {
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly r: number;
};

export function nodeHitAt(
  m: Metrics,
  g: GraphGeometry,
  scrollY: number,
  count: number,
  laneOf: (row: number) => number | null,
  x: number,
  y: number,
): NodeHit | null {
  const row = rowAtY(m, y, scrollY, count);
  if (row === null) return null;
  const lane = laneOf(row);
  if (lane === null) return null;
  const cx = g.nodeX(lane);
  const cy = rowTop(m, row, scrollY) + m.rowH / 2;
  const r = m.nodeR;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r ? { row, x: cx, y: cy, r } : null;
}

export type Anchor = {
  readonly index: number;
  readonly offset: number;
};

export const anchorAt = (m: Metrics, scrollY: number): Anchor => {
  const at = scrollY - listTopInset(m);
  const index = Math.floor(at / m.rowH);
  return { index, offset: at - index * m.rowH };
};

export const scrollForAnchor = (m: Metrics, anchor: Anchor): number =>
  listTopInset(m) + anchor.index * m.rowH + anchor.offset;

export function vScrollThumb(
  m: Metrics,
  count: number,
  scrollY: number,
  height: number,
): { top: number; height: number } | null {
  const limit = maxScroll(m, count, height);
  if (limit <= 0) return null;
  const band = contentHeight(height);
  const thumbH = Math.max(30, band * (band / (listTopInset(m) + count * m.rowH)));
  const top = HEADER_H + (Math.min(scrollY, limit) / limit) * (band - thumbH);
  return { top, height: thumbH };
}

export const MINIMAP_TOP = HEADER_H;

export const minimapBand = (height: number): number => Math.max(1, height - MINIMAP_TOP);

export const minimapFraction = (y: number, height: number): number => {
  const at = (y - MINIMAP_TOP) / minimapBand(height);
  return Math.min(1, Math.max(0, at));
};

export const rowTop = (m: Metrics, index: number, scrollY: number): number =>
  HEADER_H + listTopInset(m) + index * m.rowH - scrollY;
