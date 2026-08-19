import { useCallback, useEffect, useRef } from 'react';
import { HoverVeil, rowIsDimmed, visibleRange, type HoverChip } from '@/entities/graph';
import { canvasDensity } from '@/shared/lib/zoom';
import type { GraphSurface } from './useGraphFrame';

export function useHoverVeil({
  frameRef,
  patch,
}: Pick<GraphSurface, 'frameRef' | 'patch'>): (chip: HoverChip | null) => void {
  const veilRef = useRef(new HoverVeil());
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const tick = useCallback(() => {
    rafRef.current = null;
    const veil = veilRef.current;
    const f = frameRef.current;
    const count = f.repo?.count ?? 0;
    const { first, last } = visibleRange(f.metrics, f.scrollY, f.height, count, canvasDensity());
    const rows = Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i);
    const chip = veil.chip;
    const levels = veil.step(
      performance.now(),
      rows,
      (row) => chip !== null && rowIsDimmed(chip, row, f.rows.row(row)?.owner),
    );
    patch({ veil: levels.size > 0 ? levels : null });
    if (!veil.settled()) rafRef.current = requestAnimationFrame(tick);
  }, [frameRef, patch]);

  useEffect(() => () => stop(), [stop]);

  return useCallback(
    (chip: HoverChip | null) => {
      veilRef.current.hover(chip, performance.now());
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
    },
    [tick],
  );
}
