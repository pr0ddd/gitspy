import { useCallback } from 'react';
import {
  chipAt,
  chipInset,
  chipMetricsFor,
  chipsFor,
  placeChips,
  rowAtY,
  rowTop,
  stackChips,
  stackRowAt,
  type Chip,
  type Frame,
} from '@/entities/graph';
import type { GraphSurface } from './useGraphFrame';

export type ChipHit = { row: number; at: number | 'more'; chip: Chip | null };

const chipHeight = (f: Frame): number => f.metrics.rowH - 6;

const unfoldedHit = (
  f: Frame,
  measure: (text: string) => number,
  x: number,
  y: number,
): ChipHit | null => {
  const hover = f.hoverChip;
  if (!hover || !f.repo) return null;
  const labels = f.refsByCommit.get(hover.row);
  if (!labels) return null;
  const chips = chipsFor(
    labels,
    f.repo.remotes.map((r) => r.name),
  );
  const chipM = chipMetricsFor(f.metrics);
  const stack = stackChips(
    chips,
    measure,
    chipM,
    f.pullHeads,
    chipInset(f.cols.branchTag.width, chipM),
  );
  const chipH = chipHeight(f);
  const top = rowTop(f.metrics, hover.row, f.scrollY) + f.metrics.rowH / 2 - chipH / 2;
  const at = stackRowAt(stack, chipH, x, y - top);
  return at === null ? null : { row: hover.row, at, chip: chips[at] };
};

export function useChipHit({
  frameRef,
  canvasRef,
}: GraphSurface): (x: number, y: number) => ChipHit | null {
  const chipHitAt = useCallback(
    (x: number, y: number) => {
      const f = frameRef.current;
      if (!f.repo) return null;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return null;
      ctx.font = f.metrics.font;
      const measure = (text: string) => ctx.measureText(text).width;

      const onThePanel = unfoldedHit(f, measure, x, y);
      if (onThePanel) return onThePanel;

      if (x >= f.cols.branchTag.width) return null;
      const row = rowAtY(f.metrics, y, f.scrollY, f.repo.count);
      if (row === null) return null;
      const labels = f.refsByCommit.get(row);
      if (!labels) return null;

      const { placed, more } = placeChips(
        chipsFor(
          labels,
          f.repo.remotes.map((r) => r.name),
        ),
        measure,
        f.cols.branchTag.width,
        chipMetricsFor(f.metrics),
        f.pullHeads,
      );
      const one = chipAt(placed, x);
      if (one) return { row, at: placed.indexOf(one), chip: one.chip };
      if (more && x >= more.x && x < more.x + more.w) {
        return { row, at: 'more' as const, chip: null };
      }
      return null;
    },
    [frameRef, canvasRef],
  );
  return chipHitAt;
}
