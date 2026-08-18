import { useCallback } from 'react';
import { chipAt, chipMetricsFor, chipsFor, placeChips, rowAtY, type Chip } from '@/entities/graph';
import type { GraphSurface } from './useGraphFrame';

export type ChipHit = { row: number; at: number | 'more'; chip: Chip | null };

export function useChipHit({
  frameRef,
  canvasRef,
}: GraphSurface): (x: number, y: number) => ChipHit | null {
  const chipHitAt = useCallback(
    (x: number, y: number) => {
      const f = frameRef.current;
      if (!f.repo || x >= f.cols.branchTag.width) return null;
      const row = rowAtY(f.metrics, y, f.scrollY, f.repo.count);
      if (row === null) return null;
      const labels = f.refsByCommit.get(row);
      if (!labels) return null;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return null;

      ctx.font = f.metrics.font;
      const { placed, more } = placeChips(
        chipsFor(
          labels,
          f.repo.remotes.map((r) => r.name),
        ),
        (text) => ctx.measureText(text).width,
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
