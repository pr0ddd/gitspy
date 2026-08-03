import type { Cols } from './columns';

export const MINIMAP_W = 56;
export const HEADER_H = 26;
export const HSCROLL_H = 9;

const PAD_X = 14;

export type Metrics = {
  readonly rowH: number;
  readonly laneW: number;
  readonly nodeR: number;
  readonly avatars: boolean;
  readonly fontPx: number;
  readonly font: string;
  readonly fontMono: string;
};

const fonts = (px: number, monoPx: number) => ({
  fontPx: px,
  font: `${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`,
  fontMono: `${monoPx}px ui-monospace, SFMono-Regular, Menlo, monospace`,
});

export const METRICS_AVATARS: Metrics = {
  rowH: 30,
  laneW: 24,
  nodeR: 10,
  avatars: true,
  ...fonts(13, 12),
};

export const METRICS_COMPACT: Metrics = {
  rowH: 22,
  laneW: 14,
  nodeR: 4.5,
  avatars: false,
  ...fonts(12, 11),
};

export const listWidth = (width: number): number => width - MINIMAP_W;

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
  Math.max(0, count * m.rowH - contentHeight(viewportH));

export function scrollToReveal(
  m: Metrics,
  index: number,
  scrollY: number,
  height: number,
  count: number,
): number {
  const band = contentHeight(height);
  const top = index * m.rowH;
  const bottom = top + m.rowH;
  const limit = maxScroll(m, count, height);

  if (top < scrollY) return Math.max(0, Math.min(top, limit));
  if (bottom > scrollY + band) return Math.max(0, Math.min(bottom - band, limit));
  return scrollY;
}

export function rowAtY(m: Metrics, y: number, scrollY: number, count: number): number | null {
  if (y < HEADER_H) return null;
  const index = Math.floor((y - HEADER_H + scrollY) / m.rowH);
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
  const first = Math.max(0, Math.floor(scrollY / m.rowH));
  const shift = Math.round((HEADER_H - (scrollY - first * m.rowH)) * dpr) / dpr;
  const last = Math.min(count, first + Math.ceil(contentHeight(height) / m.rowH) + 1);
  return { first, last, shift };
}

export type GraphGeometry = {
  readonly gLeft: number;
  readonly gRight: number;
  readonly pinX: number;
  readonly leftShadow: boolean;
  readonly rightShadow: boolean;
  readonly laneAt: (lane: number) => number;
  readonly contentLeft: number;
  readonly contentRight: number;
  readonly nodeX: (lane: number) => number;
  readonly isStuck: (lane: number) => boolean;
};

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

  const contentLeft = gLeft + (scrollable ? pinW : 0);
  const contentRight = gRight - (scrollable ? pinW : 0);

  const rest = gLeft + PAD_X - 0.5;
  const hi = Math.max(rest, gRight - m.nodeR - 4.5);
  const lo = Math.min(rest, hi);
  const maxX = maxScrollX(m, maxLane, cols.graph.width);
  const laneAt = (lane: number): number => gLeft + PAD_X + lane * m.laneW - scrollX;

  return {
    gLeft,
    gRight,
    pinX: scrollable ? hi : Number.POSITIVE_INFINITY,
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

export type Anchor = {
  readonly index: number;
  readonly offset: number;
};

export const anchorAt = (m: Metrics, scrollY: number): Anchor => ({
  index: Math.floor(scrollY / m.rowH),
  offset: scrollY - Math.floor(scrollY / m.rowH) * m.rowH,
});

export const scrollForAnchor = (m: Metrics, anchor: Anchor): number =>
  anchor.index * m.rowH + anchor.offset;

export const MINIMAP_TOP = HEADER_H;

export const minimapBand = (height: number): number => Math.max(1, height - MINIMAP_TOP);

export const minimapFraction = (y: number, height: number): number => {
  const at = (y - MINIMAP_TOP) / minimapBand(height);
  return Math.min(1, Math.max(0, at));
};

export const rowTop = (m: Metrics, index: number, scrollY: number): number =>
  HEADER_H + index * m.rowH - scrollY;
