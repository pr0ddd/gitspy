import type { LayoutView, RefView } from './types';

/**
 * Строка на экране: либо коммит, либо свёрнутая цепочка.
 *
 * Свёртка — это фолдинг, а не фильтр: коммиты остаются на месте, из счёта
 * не исчезают и раскрываются по клику.
 */
export type ViewRow = { readonly fold: false; readonly index: number } | {
  readonly fold: true;
  readonly start: number;
  readonly len: number;
};

export type FoldOptions = {
  readonly enabled: boolean;
  readonly minRun: number;
  readonly expanded: ReadonlySet<number>;
};

/**
 * Сворачиваются только топологически скучные цепочки: подряд идущие коммиты
 * одного автора, у каждого ровно один родитель, без меток и без ответвлений.
 *
 * Ограничение существенное: если свернуть участок с мержем или веткой, граф
 * начнёт врать. Лучше свернуть меньше, чем спрятать структуру.
 */
function foldable(layout: LayoutView, refsByCommit: ReadonlyMap<number, RefView[]>, i: number): boolean {
  if (layout.kinds[i] !== 0) return false;
  if (refsByCommit.has(i)) return false;
  for (let s = layout.seg_offsets[i]; s < layout.seg_offsets[i + 1]; s++) {
    if (layout.seg_kind[s] !== 0) return false;
  }
  return true;
}

export function buildView(
  layout: LayoutView | null,
  refsByCommit: ReadonlyMap<number, RefView[]>,
  fold: FoldOptions,
): ViewRow[] {
  if (!layout) return [];
  const rows: ViewRow[] = [];
  let i = 0;
  while (i < layout.count) {
    if (fold.enabled && !fold.expanded.has(i) && foldable(layout, refsByCommit, i)) {
      const author = layout.author_of[i];
      let j = i;
      while (
        j < layout.count &&
        layout.author_of[j] === author &&
        foldable(layout, refsByCommit, j)
      ) {
        j++;
      }
      if (j - i >= fold.minRun) {
        rows.push({ fold: true, start: i, len: j - i });
        i = j;
        continue;
      }
    }
    rows.push({ fold: false, index: i });
    i++;
  }
  return rows;
}

/** 0 — не родня, 1 — предок, 2 — потомок, 3 — сам выбранный коммит. */
export function ancestryMask(layout: LayoutView, selected: number): Uint8Array {
  const mask = new Uint8Array(layout.count);
  mask[selected] = 3;

  // Родитель всегда идёт ПОСЛЕ потомка, поэтому предки набираются одним
  // проходом вниз — без очереди и без рекурсии.
  for (let i = selected; i < layout.count; i++) {
    if (mask[i] === 0) continue;
    for (let p = layout.parent_offsets[i]; p < layout.parent_offsets[i + 1]; p++) {
      const q = layout.parent_idx[p];
      if (mask[q] === 0) mask[q] = 1;
    }
  }

  // Потомки — одним проходом вверх по той же причине.
  for (let i = selected - 1; i >= 0; i--) {
    for (let p = layout.parent_offsets[i]; p < layout.parent_offsets[i + 1]; p++) {
      const q = layout.parent_idx[p];
      if (q === selected || mask[q] === 2) {
        mask[i] = 2;
        break;
      }
    }
  }

  return mask;
}

/** Сжатая карта всей истории: на каждый пиксель высоты — битовая маска занятых дорожек. */
export type Minimap = {
  readonly buckets: number;
  readonly bits: Uint32Array;
  readonly maxLane: number;
};

const MAX_MINIMAP_LANES = 32;

export function buildMinimap(
  layout: LayoutView | null,
  view: readonly ViewRow[],
  height: number,
): Minimap {
  const buckets = Math.max(1, Math.floor(height));
  const bits = new Uint32Array(buckets);
  if (!layout || view.length === 0) return { buckets, bits, maxLane: 0 };

  for (let r = 0; r < view.length; r++) {
    const row = view[r];
    const commit = row.fold ? row.start : row.index;
    const lane = Math.min(layout.lanes[commit], MAX_MINIMAP_LANES - 1);
    const bucket = Math.min(buckets - 1, Math.floor((r * buckets) / view.length));
    bits[bucket] |= 1 << lane;
  }

  return { buckets, bits, maxLane: Math.min(layout.max_lane, MAX_MINIMAP_LANES - 1) };
}
