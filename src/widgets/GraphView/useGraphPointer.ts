import { useEffect } from 'react';
import {
  authorsLine,
  graphGeometry,
  hoveredRow,
  layoutColumns,
  listWidth,
  maxScrollX,
  minimapFraction,
  nodeHitAt,
  pointerTarget,
  reset,
  resized,
  saveWidths,
  type Frame,
  type HoverChip,
  type NodeHit,
  type PointerScene,
} from '@/entities/graph';
import type { RefView } from '@/shared/api/types';
import type { ChipHit } from './useChipHit';
import type { GraphSurface } from './useGraphFrame';

export type HoverNode = NodeHit & { authors: string };

export function useGraphPointer(
  {
    hostRef,
    frameRef,
    storedRef,
    hiddenRef,
    minimapRef,
    dragRef,
    patch,
    clampScroll,
    clampScrollX,
    reflow,
  }: GraphSurface,
  chipHitAt: (x: number, y: number) => ChipHit | null,
  {
    onSelect,
    onCheckoutRef,
    setHoverNode,
  }: {
    onSelect: (index: number) => void;
    onCheckoutRef: (ref: RefView) => void;
    setHoverNode: React.Dispatch<React.SetStateAction<HoverNode | null>>;
  },
): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const local = (e: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const jumpFromMinimap = (y: number) => {
      const f = frameRef.current;
      const total = (f.repo?.count ?? 0) * f.metrics.rowH;
      patch({
        scrollY: clampScroll(minimapFraction(y, f.height) * total - f.height / 2),
      });
    };

    const dragHScroll = (x: number) => {
      const f = frameRef.current;
      const left = f.cols.graph.left;
      const track = f.cols.graph.width;
      const max = maxScrollX(f.metrics, f.repo?.maxLane ?? 0, f.cols.graph.width);
      patch({
        scrollX: clampScrollX(((x - left) / Math.max(1, track)) * max * 1.15),
      });
    };

    const dragDivider = (x: number) => {
      const held = dragRef.current;
      if (held === null || typeof held !== 'object') return;
      const f = frameRef.current;
      storedRef.current = resized(
        held.fromStored,
        layoutColumns(listWidth(f.width, minimapRef.current), held.fromStored, hiddenRef.current),
        held.divider,
        x - held.fromX,
      );
      saveWidths(storedRef.current);
      reflow();
    };

    const sceneOf = (f: Frame): PointerScene => ({
      width: f.width,
      minimap: minimapRef.current,
      height: f.height,
      cols: f.cols,
      metrics: f.metrics,
      scrollY: f.scrollY,
      count: f.repo?.count ?? 0,
    });

    const sameChip = (a: HoverChip | null, b: HoverChip | null) =>
      a === b || (a !== null && b !== null && a.row === b.row && a.at === b.at);

    const onMove = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      if (dragRef.current === 'minimap') return jumpFromMinimap(y);
      if (dragRef.current === 'hscroll') return dragHScroll(x);
      if (typeof dragRef.current === 'object' && dragRef.current !== null) return dragDivider(x);

      const target = pointerTarget(x, y, sceneOf(f));
      const hit = chipHitAt(x, y);
      host.style.cursor = hit ? 'pointer' : target.kind === 'divider' ? 'col-resize' : '';
      const index = hoveredRow(hit, target);
      const hovered = hit ? { row: hit.row, at: hit.at } : null;
      if (index !== f.hover || !sameChip(hovered, f.hoverChip)) {
        patch({ hover: index, hoverChip: hovered });
      }
      showAuthorsUnder(x, y, f);
    };

    const showAuthorsUnder = (x: number, y: number, f: Frame) => {
      const g = graphGeometry(f.metrics, f.repo?.maxLane ?? 0, f.scrollX, f.cols);
      const node = nodeHitAt(
        f.metrics,
        g,
        f.scrollY,
        f.repo?.count ?? 0,
        (row) => f.rows.row(row)?.lane ?? null,
        x,
        y,
      );
      const row = node ? f.rows.row(node.row) : null;
      if (!node || row?.kind !== 'commit') {
        setHoverNode((now) => (now === null ? now : null));
        return;
      }
      setHoverNode((now) =>
        now && now.row === node.row && now.x === node.x && now.y === node.y
          ? now
          : { ...node, authors: authorsLine(row) },
      );
    };

    const onDown = (e: MouseEvent) => {
      const { x, y } = local(e);
      const f = frameRef.current;
      const target = pointerTarget(x, y, sceneOf(f));

      switch (target.kind) {
        case 'minimap':
        case 'vscroll':
          dragRef.current = 'minimap';
          jumpFromMinimap(y);
          return;
        case 'divider':
          dragRef.current = {
            divider: target.divider,
            fromX: x,
            fromStored: { ...storedRef.current },
          };
          return;
        case 'hscroll':
          dragRef.current = 'hscroll';
          dragHScroll(x);
          return;
        case 'row':
          patch({ selected: target.index });
          onSelect(target.index);
          return;
        case 'none':
          return;
      }
    };

    const onUp = () => {
      dragRef.current = null;
    };
    const onLeave = () => {
      patch({ hover: null, hoverChip: null });
      setHoverNode(null);
    };

    const onDouble = (e: MouseEvent) => {
      const { x, y } = local(e);
      const hit = chipHitAt(x, y);
      if (hit && hit.chip && hit.chip.refs.length > 0) {
        onCheckoutRef(hit.chip.refs[0]);
        return;
      }
      const target = pointerTarget(x, y, sceneOf(frameRef.current));
      if (target.kind !== 'divider') return;
      let cleaned = storedRef.current;
      if (target.divider.take) cleaned = reset(cleaned, target.divider.take);
      if (target.divider.give) cleaned = reset(cleaned, target.divider.give);
      storedRef.current = cleaned;
      saveWidths(storedRef.current);
      reflow();
    };

    host.addEventListener('mousemove', onMove);
    host.addEventListener('mousedown', onDown);
    host.addEventListener('dblclick', onDouble);
    host.addEventListener('mouseleave', onLeave);
    window.addEventListener('mouseup', onUp);
    return () => {
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('mousedown', onDown);
      host.removeEventListener('dblclick', onDouble);
      host.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('mouseup', onUp);
    };
  }, [
    hostRef,
    frameRef,
    storedRef,
    hiddenRef,
    minimapRef,
    dragRef,
    patch,
    clampScroll,
    clampScrollX,
    onSelect,
    onCheckoutRef,
    chipHitAt,
    reflow,
    setHoverNode,
  ]);
}
