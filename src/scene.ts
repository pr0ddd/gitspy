export const MINIMAP_W = 56;
export const HEADER_H = 26;
export const BRANCH_W = 210;
export const HSCROLL_H = 9;

const PAD_X = 14;
const RIGHT_COLS_W = 620;
const GRAPH_MIN_W = 140;
const GRAPH_MAX_W = 760;

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

export const listWidth = (width: number): number => width - MINIMAP_W;

export const contentHeight = (height: number): number => Math.max(0, height - HEADER_H);

export function graphViewWidth(width: number): number {
  const rest = listWidth(width) - BRANCH_W - RIGHT_COLS_W;
  return Math.max(GRAPH_MIN_W, Math.min(GRAPH_MAX_W, rest));
}

export const graphLeft = (): number => BRANCH_W;

export const graphRight = (width: number): number => BRANCH_W + graphViewWidth(width);

export const graphContentWidth = (m: Metrics, maxLane: number): number =>
  PAD_X * 2 + maxLane * m.laneW + m.nodeR * 2;

export const pinWidth = (m: Metrics): number => m.nodeR * 2 + 10;

export const graphScrollable = (m: Metrics, maxLane: number, width: number): boolean =>
  graphContentWidth(m, maxLane) > graphViewWidth(width);

export const maxScrollX = (m: Metrics, maxLane: number, width: number): number => {
  if (!graphScrollable(m, maxLane, width)) return 0;
  return graphContentWidth(m, maxLane) - (graphViewWidth(width) - 2 * pinWidth(m));
};

export const maxScroll = (m: Metrics, count: number, viewportH: number): number =>
  Math.max(0, count * m.rowH - contentHeight(viewportH));

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

export type HitTarget = 'hash' | 'row' | 'minimap' | 'hscroll' | 'none';

export function hitTest(
  x: number,
  y: number,
  width: number,
  height: number,
): HitTarget {
  if (x >= listWidth(width)) return 'minimap';
  if (y >= height - HSCROLL_H && x >= graphLeft() && x <= graphRight(width)) return 'hscroll';
  if (y < HEADER_H) return 'none';
  if (x >= hashColumnLeft(width)) return 'hash';
  return 'row';
}

export const hashColumnLeft = (width: number): number => listWidth(width) - 80;
