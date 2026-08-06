import { dividerAt, type Cols, type Divider } from './columns';
import { HEADER_H, HSCROLL_H, listWidth, maxScroll, rowAtY, type Metrics } from './scene';

export type PointerTarget =
  | { kind: 'minimap' }
  | { kind: 'vscroll' }
  | { kind: 'divider'; divider: Divider }
  | { kind: 'hscroll' }
  | { kind: 'row'; index: number }
  | { kind: 'none' };

export type PointerScene = {
  readonly width: number;
  readonly minimap: boolean;
  readonly height: number;
  readonly cols: Cols;
  readonly metrics: Metrics;
  readonly scrollY: number;
  readonly count: number;
};

export function pointerTarget(x: number, y: number, scene: PointerScene): PointerTarget {
  const { width, minimap, height, cols, metrics, scrollY, count } = scene;

  if (minimap && x >= listWidth(width)) return { kind: 'minimap' };
  if (
    !minimap &&
    y >= HEADER_H &&
    x >= listWidth(width, false) &&
    maxScroll(metrics, count, height) > 0
  ) {
    return { kind: 'vscroll' };
  }

  if (y < HEADER_H) {
    const divider = dividerAt(x, cols);
    return divider ? { kind: 'divider', divider } : { kind: 'none' };
  }

  const gLeft = cols.graph.left;
  const gRight = cols.graph.left + cols.graph.width;
  if (y >= height - HSCROLL_H && x >= gLeft && x <= gRight) return { kind: 'hscroll' };

  const index = rowAtY(metrics, y, scrollY, count);
  return index === null ? { kind: 'none' } : { kind: 'row', index };
}
