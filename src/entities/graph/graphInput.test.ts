import { describe, expect, it } from 'vitest';
import { layoutColumns } from './columns';
import { hoveredRow, pointerTarget, type PointerScene } from './graphInput';
import { HEADER_H, listTopInset, listWidth, METRICS_AVATARS } from './scene';

const WIDTH = 1400;
const HEIGHT = 800;

const scene: PointerScene = {
  minimap: true,
  width: WIDTH,
  height: HEIGHT,
  cols: layoutColumns(listWidth(WIDTH), {}),
  metrics: METRICS_AVATARS,
  scrollY: 0,
  count: 100,
};

describe('pointer routing', () => {
  it('routes everything right of the list to the minimap, header included', () => {
    expect(pointerTarget(WIDTH - 10, 400, scene).kind).toBe('minimap');
    expect(pointerTarget(WIDTH - 10, 5, scene).kind).toBe('minimap');
  });

  it('catches a divider in the header before the row beneath it', () => {
    const edge = scene.cols.branchTag.width;
    const inHeader = pointerTarget(edge, HEADER_H - 5, scene);
    expect(inHeader.kind).toBe('divider');

    const below = pointerTarget(edge, HEADER_H + 10, scene);
    expect(below.kind).toBe('row');
  });

  it('selects nothing in the header away from a divider', () => {
    expect(pointerTarget(600, 5, scene).kind).toBe('none');
  });

  it('keeps the horizontal scrollbar under the graph column only', () => {
    const inside = scene.cols.graph.left + 20;
    const outside = scene.cols.message.left + 20;
    expect(pointerTarget(inside, HEIGHT - 3, scene).kind).toBe('hscroll');
    expect(pointerTarget(outside, HEIGHT - 3, scene).kind).toBe('row');
  });

  it('reports the row index for a point in the middle of a row', () => {
    const hit = pointerTarget(
      600,
      HEADER_H + listTopInset(scene.metrics) + scene.metrics.rowH * 2 + 1,
      scene,
    );
    expect(hit).toEqual({ kind: 'row', index: 2 });
  });

  it('has no row past the end of the history', () => {
    const short: PointerScene = { ...scene, count: 1 };
    expect(pointerTarget(600, HEADER_H + scene.metrics.rowH * 5, short).kind).toBe('none');
  });
});

describe('which row is hovered', () => {
  it('a chip decides for its own row, even when its unfolded panel hangs over the rows below', () => {
    expect(
      hoveredRow({ row: 3 }, { kind: 'row', index: 4 }),
      'the pointer is over row 4 geometrically, but on the panel of row 3',
    ).toBe(3);
    expect(hoveredRow(null, { kind: 'row', index: 4 }), 'no chip: the row under the pointer').toBe(
      4,
    );
    expect(hoveredRow(null, { kind: 'none' }), 'nothing under the pointer').toBeNull();
  });
});
