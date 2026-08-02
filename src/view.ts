import type { LayoutView } from './types';

export type Minimap = {
  readonly buckets: number;
  readonly bits: Uint32Array;
  readonly maxLane: number;
};

const MAX_MINIMAP_LANES = 32;

export function buildMinimap(layout: LayoutView | null, height: number): Minimap {
  const buckets = Math.max(1, Math.floor(height));
  const bits = new Uint32Array(buckets);
  if (!layout || layout.count === 0) return { buckets, bits, maxLane: 0 };

  for (let i = 0; i < layout.count; i++) {
    const lane = Math.min(layout.lanes[i], MAX_MINIMAP_LANES - 1);
    const bucket = Math.min(buckets - 1, Math.floor((i * buckets) / layout.count));
    bits[bucket] |= 1 << lane;
  }

  return { buckets, bits, maxLane: Math.min(layout.max_lane, MAX_MINIMAP_LANES - 1) };
}
