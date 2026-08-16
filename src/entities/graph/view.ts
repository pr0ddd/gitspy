import type { RepoView } from '@/shared/api/types';

export type Minimap = {
  readonly buckets: number;
  readonly bits: Uint32Array;
  readonly maxLane: number;
};

const MAX_MINIMAP_LANES = 32;

export function buildMinimap(repo: RepoView | null, height: number): Minimap {
  const buckets = Math.max(1, Math.floor(height));
  const bits = new Uint32Array(buckets);
  if (!repo || repo.count === 0 || repo.minimap.length === 0) {
    return { buckets, bits, maxLane: 0 };
  }

  const source = repo.minimap;
  for (let bucket = 0; bucket < buckets; bucket++) {
    const from = Math.floor((bucket * source.length) / buckets);
    const to = Math.max(from + 1, Math.floor(((bucket + 1) * source.length) / buckets));
    let mask = 0;
    for (let i = from; i < to && i < source.length; i++) mask |= source[i];
    bits[bucket] = mask;
  }

  return { buckets, bits, maxLane: Math.min(repo.maxLane, MAX_MINIMAP_LANES - 1) };
}
