import { describe, expect, it } from 'vitest';
import {
  scrollToReveal,
  HEADER_H,
  listTopInset,
  METRICS_AVATARS,
  METRICS_COMPACT,
  MINIMAP_TOP,
  anchorAt,
  contentHeight,
  graphGeometry,
  listWidth,
  maxScroll,
  vScrollThumb,
  VSCROLL_W,
  MINIMAP_W,
  maxScrollX,
  minimapBand,
  minimapFraction,
  rowAtY,
  rowBandHeight,
  scrollToCenter,
  rowBandInset,
  rowTop,
  scrollForAnchor,
  visibleRange,
} from './scene';
import { layoutColumns } from './columns';

const M = METRICS_AVATARS;
const WIDTH = 1400;
const HEIGHT = 800;

const colsWith = (graph: number) => layoutColumns(listWidth(WIDTH), { graph });
const COLS = layoutColumns(listWidth(WIDTH), {});

describe('the gap between graph rows', () => {
  it('does not fill the row to its full height: neighbouring bands stay apart, as in GitKraken', () => {
    expect(rowBandHeight(M), 'the band inside a 30px row').toBe(24);
    expect(
      M.rowH - rowBandHeight(M),
      'the gap is 21% of the row step, measured against GitKraken',
    ).toBe(6);
  });

  it('shrinks the gap together with the row on the compact layout instead of keeping it as it was', () => {
    expect(rowBandInset(METRICS_COMPACT), 'a 28px row').toBe(3);
    expect(rowBandHeight(METRICS_COMPACT)).toBe(22);
  });

  it('fits the node inside the band whole at both densities', () => {
    for (const m of [M, METRICS_COMPACT]) {
      expect(
        rowBandHeight(m) >= m.nodeR * 2,
        `a node of radius ${m.nodeR} sticks out of the ${rowBandHeight(m)}px band`,
      ).toBe(true);
    }
  });

  it('separates the first band from the header by the same gap that separates neighbouring commits', () => {
    for (const m of [M, METRICS_COMPACT]) {
      const firstBandTop = rowTop(m, 0, 0) + rowBandInset(m);
      expect(
        firstBandTop - HEADER_H,
        'from the bottom of the header to the first card it is the between-commits gap',
      ).toBe(m.rowH - rowBandHeight(m));
    }
  });
});

describe('visible range', () => {
  it('starts at row zero at the top of the history', () => {
    const { first, last } = visibleRange(M, 0, HEIGHT, 1000);
    expect(first).toBe(0);
    expect(last).toBe(Math.ceil(contentHeight(HEIGHT) / M.rowH) + 1);
  });

  it('does not run past the end of the history', () => {
    const { last } = visibleRange(M, 1e9, HEIGHT, 40);
    expect(last).toBe(40);
  });

  it('shifts by the part of the row that went under the header', () => {
    const { shift } = visibleRange(M, listTopInset(M) + M.rowH * 3 + 7, HEIGHT, 1000);
    expect(shift).toBe(HEADER_H - 7);
  });
});

describe('scroll anchor', () => {
  it('survives a change of density: the commit stays where it was', () => {
    const scrollY = 137 * M.rowH + 11;
    const anchor = anchorAt(M, scrollY);
    expect(anchor.index).toBe(137);

    const moved = scrollForAnchor(METRICS_COMPACT, anchor);
    expect(anchorAt(METRICS_COMPACT, moved).index).toBe(137);
  });

  it('round-trips back to the original scroll position', () => {
    const scrollY = 42 * M.rowH + 9;
    expect(scrollForAnchor(M, anchorAt(M, scrollY))).toBeCloseTo(scrollY);
  });
});

describe('centring the selected row', () => {
  const H = HEADER_H + M.rowH * 10;

  it('leaves a visible row alone: a click in the graph must not jerk the scroll', () => {
    const at = M.rowH * 100;
    expect(scrollToCenter(M, 103, at, H, 1000)).toBe(at);
  });

  it('puts a row from outside the window into the middle of the window', () => {
    const got = scrollToCenter(M, 500, 0, H, 1000);
    const view = H - HEADER_H;
    expect(got).toBe(listTopInset(M) + 500 * M.rowH - (view - M.rowH) / 2);
  });

  it('clamps to the limits at the ends of the history instead of going past them', () => {
    expect(scrollToCenter(M, 0, M.rowH * 500, H, 1000)).toBe(0);
    expect(scrollToCenter(M, 999, 0, H, 1000)).toBe(maxScroll(M, 1000, H));
  });
});

describe('the row under the cursor', () => {
  it('finds no row inside the header', () => {
    expect(rowAtY(M, HEADER_H - 1, 0, 100)).toBeNull();
  });

  it('starts the first row after the top inset', () => {
    expect(
      rowAtY(M, HEADER_H + 1, 0, 100),
      'a click in the gap between the header and the first row hits no row',
    ).toBeNull();
    expect(rowAtY(M, HEADER_H + listTopInset(M) + 1, 0, 100)).toBe(0);
  });

  it('finds no row past the end of the history', () => {
    expect(rowAtY(M, HEADER_H + M.rowH * 50, 0, 10)).toBeNull();
  });
});

describe('scroll limit', () => {
  it('does not scroll a history shorter than the window', () => {
    expect(maxScroll(M, 3, HEIGHT)).toBe(0);
  });

  it('stops a long one at the last row, top inset included', () => {
    expect(maxScroll(M, 1000, HEIGHT)).toBe(
      listTopInset(M) + 1000 * M.rowH - contentHeight(HEIGHT),
    );
  });
});

describe('graph geometry', () => {
  it('neither scrolls sideways nor pins nodes while the graph is narrow enough', () => {
    const g = graphGeometry(M, 2, 0, COLS);
    expect(maxScrollX(M, 2, COLS.graph.width)).toBe(0);
    expect(g.isStuck(0)).toBe(false);
    expect(g.nodeX(1)).toBe(g.laneAt(1));
  });

  it('pins the nodes beyond the edge of a wide graph to that edge', () => {
    const g = graphGeometry(M, 200, 0, COLS);
    expect(maxScrollX(M, 200, COLS.graph.width)).toBeGreaterThan(0);
    expect(g.isStuck(199)).toBe(true);
    expect(g.nodeX(199)).toBeLessThanOrEqual(COLS.graph.left + COLS.graph.width);
  });

  it('shows the left shadow only when something is hidden on the left', () => {
    expect(graphGeometry(M, 200, 0, COLS).leftShadow).toBe(false);
    expect(graphGeometry(M, 200, 40, COLS).leftShadow).toBe(true);
  });

  it('drops the right shadow at the very right edge', () => {
    const max = maxScrollX(M, 200, COLS.graph.width);
    expect(graphGeometry(M, 200, 0, COLS).rightShadow).toBe(true);
    expect(graphGeometry(M, 200, max, COLS).rightShadow).toBe(false);
  });

  it('runs the lanes left to right, one lane width apart', () => {
    const g = graphGeometry(M, 10, 0, COLS);
    expect(g.laneAt(3) - g.laneAt(2)).toBe(M.laneW);
  });
});

describe('where the input field sits in the row', () => {
  it('moves the top of the row up by exactly the scroll offset', () => {
    expect(rowTop(M, 0, 0)).toBe(HEADER_H + listTopInset(M));
    expect(rowTop(M, 0, 40)).toBe(HEADER_H + listTopInset(M) - 40);
    expect(rowTop(M, 3, 0)).toBe(HEADER_H + listTopInset(M) + 3 * M.rowH);
  });
});

describe('the minimap under the header', () => {
  it('does not go above the start of the history on a click at the very top of the band', () => {
    expect(minimapFraction(0, 800)).toBe(0);
    expect(minimapFraction(MINIMAP_TOP, 800)).toBe(0);
  });

  it('gives the end of the history on a click at the very bottom', () => {
    expect(minimapFraction(800, 800)).toBe(1);
  });

  it('maps the middle of the band to the middle of the history, not to the middle of the window', () => {
    const height = 800;
    const middle = MINIMAP_TOP + minimapBand(height) / 2;
    expect(minimapFraction(middle, height)).toBeCloseTo(0.5);
  });
});

describe('the lane anchor', () => {
  it('keeps the lanes in place across the scrollability threshold: the gate clips, it does not move', () => {
    const narrow = colsWith(300);
    const wide = colsWith(1200);
    const before = graphGeometry(M, 20, 0, narrow);
    const after = graphGeometry(M, 20, 0, wide);
    expect(before.laneAt(0)).toBe(after.laneAt(0));
  });
});

describe('pinning at rest', () => {
  it('pins no node of a scrollable graph while the horizontal scroll is at zero', () => {
    const narrow = colsWith(200);
    const g = graphGeometry(M, 60, 0, narrow);
    expect(g.isStuck(0)).toBe(false);
    expect(g.nodeX(0)).toBe(g.laneAt(0));
  });
});

describe('a narrow graph column', () => {
  it('keeps the lane step independent of the column width: the border does not zoom the content', () => {
    const wide = graphGeometry(M, 99, 0, colsWith(700));
    const tight = graphGeometry(M, 99, 0, colsWith(120));
    expect(wide.laneAt(1) - wide.laneAt(0)).toBe(M.laneW);
    expect(tight.laneAt(1) - tight.laneAt(0)).toBe(M.laneW);
  });

  it('pins the nodes that do not fit into a single stack at the edge', () => {
    const g = graphGeometry(M, 99, 0, colsWith(70));
    expect(g.nodeX(60)).toBe(g.nodeX(99));
    expect(g.isStuck(60)).toBe(true);
  });
});

describe('the minimum graph column', () => {
  it('leaves a free avatar in place until the edge has reached it', () => {
    const roomy = graphGeometry(M, 99, 0, colsWith(200));
    const tight = graphGeometry(M, 99, 0, layoutColumns(listWidth(WIDTH), { graph: 36 }));
    expect(roomy.nodeX(0)).toBe(roomy.laneAt(0));
    expect(tight.nodeX(0)).toBe(tight.laneAt(0));
  });

  it('merges the pinned stack and the free node into one line at the minimum width', () => {
    const g = graphGeometry(M, 99, 0, layoutColumns(listWidth(WIDTH), { graph: 36 }));
    expect(Math.abs(g.nodeX(99) - g.nodeX(0))).toBeLessThanOrEqual(M.nodeR);
  });

  it('folds the lines of the pinned lanes into the axis of the stack instead of losing them', () => {
    const g = graphGeometry(M, 99, 0, colsWith(90));
    expect(Math.min(g.laneAt(50), g.pinX)).toBe(g.pinX);
    expect(g.pinX).toBe(g.nodeX(50));
  });

  it('pins nothing in a roomy graph', () => {
    const g = graphGeometry(M, 3, 0, colsWith(400));
    expect(g.pinX).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('the floor of the graph column', () => {
  it('stands every node in one line at the minimum width, with nothing left over', () => {
    const g = graphGeometry(M, 99, 0, layoutColumns(listWidth(WIDTH), { graph: 28 }));
    expect(g.nodeX(0)).toBe(g.nodeX(99));
  });
});

describe('scrolling to reveal the selected row', () => {
  const H = HEADER_H + M.rowH * 10;
  const COUNT = 1000;

  it('does not touch a visible row at all', () => {
    const at = M.rowH * 100;
    expect(scrollToReveal(M, 105, at, H, COUNT)).toBe(at);
  });

  it('brings a row above the window up to its top edge', () => {
    expect(scrollToReveal(M, 3, M.rowH * 100, H, COUNT)).toBe(listTopInset(M) + M.rowH * 3);
  });

  it('brings a row below the window to the bottom edge, not to the top one', () => {
    const got = scrollToReveal(M, 200, 0, H, COUNT);
    expect(got).toBe(listTopInset(M) + M.rowH * 201 - M.rowH * 10);
    expect(got).toBeLessThan(M.rowH * 200);
  });

  it('does not take the last row past the scroll limit', () => {
    const got = scrollToReveal(M, COUNT - 1, 0, H, COUNT);
    expect(got).toBe(maxScroll(M, COUNT, H));
  });

  it('keeps the scroll at zero in a repository shorter than the window', () => {
    expect(scrollToReveal(M, 2, 0, H, 3)).toBe(0);
  });
});

describe('the minimap rail', () => {
  it('ends the list before the scrollbar rail rather than underneath it when there is no minimap', () => {
    expect(listWidth(1000)).toBe(1000 - MINIMAP_W);
    expect(
      listWidth(1000, false),
      'the thumb gets a rail of its own, otherwise it lies over the text of the columns',
    ).toBe(1000 - VSCROLL_W);
    expect(VSCROLL_W).toBeLessThan(MINIMAP_W);
  });
});

describe('the vertical scrollbar without the minimap', () => {
  const m = METRICS_AVATARS;

  it('gives no thumb to a list that fits', () => {
    expect(vScrollThumb(m, 5, 0, 800), 'nothing to scroll means nothing to draw').toBeNull();
  });

  it('sizes the thumb by the visible fraction and lets it travel the whole rail', () => {
    const count = 1000;
    const height = 800;
    const top = vScrollThumb(m, count, 0, height)!;
    expect(top.top).toBe(HEADER_H);

    const limit = maxScroll(m, count, height);
    const bottom = vScrollThumb(m, count, limit, height)!;
    expect(
      Math.round(bottom.top + bottom.height),
      'at the very bottom the thumb stops at the edge instead of overshooting it',
    ).toBe(height);
    expect(bottom.height).toBeGreaterThanOrEqual(30);
  });
});
