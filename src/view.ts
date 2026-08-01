import type { LayoutView, RefView } from './types';

/**
 * Строка на экране: коммит либо свёрнутая цепочка.
 *
 * `groupStart` стоит у первого коммита развёрнутой цепочки — по нему рисуется
 * шеврон «свернуть обратно». Без него развёрнутый блок невозможно закрыть.
 */
export type ViewRow =
  | { readonly fold: false; readonly index: number; readonly groupStart: number | null }
  | { readonly fold: true; readonly start: number; readonly len: number };

export type FoldOptions = {
  /** Идентификаторы авторов, чьи цепочки сворачиваем. Пусто — не сворачиваем. */
  readonly authors: ReadonlySet<number>;
  readonly minRun: number;
  /** Развёрнутые цепочки: начало → длина. Диапазон целиком, а не одна строка. */
  readonly expanded: ReadonlyMap<number, number>;
};

/**
 * Сворачиваются только топологически скучные цепочки: подряд идущие коммиты
 * одного автора, у каждого ровно один родитель, без меток и без ответвлений.
 *
 * Ограничение существенное: свернуть участок с мержем или веткой — значит
 * спрятать структуру и заставить граф врать.
 */
function foldable(
  layout: LayoutView,
  refsByCommit: ReadonlyMap<number, RefView[]>,
  i: number,
): boolean {
  if (layout.kinds[i] !== 0) return false;
  if (refsByCommit.has(i)) return false;
  for (let s = layout.seg_offsets[i]; s < layout.seg_offsets[i + 1]; s++) {
    if (layout.seg_kind[s] !== 0) return false;
  }
  return true;
}

/** Длина цепочки, начинающейся с i, по правилам свёртки. Ноль — не цепочка. */
function runLength(
  layout: LayoutView,
  refsByCommit: ReadonlyMap<number, RefView[]>,
  fold: FoldOptions,
  i: number,
): number {
  const author = layout.author_of[i];
  if (!fold.authors.has(author)) return 0;
  let j = i;
  while (j < layout.count && layout.author_of[j] === author && foldable(layout, refsByCommit, j)) {
    j++;
  }
  return j - i;
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
    const expandedLen = fold.expanded.get(i);
    if (expandedLen !== undefined) {
      // Развёрнутая цепочка показывается целиком и заново НЕ сворачивается —
      // иначе клик открывал бы ровно один коммит, а остальные схлопывались.
      const end = Math.min(layout.count, i + expandedLen);
      for (let k = i; k < end; k++) rows.push({ fold: false, index: k, groupStart: i });
      i = end;
      continue;
    }

    const len = runLength(layout, refsByCommit, fold, i);
    if (len >= fold.minRun) {
      rows.push({ fold: true, start: i, len });
      i += len;
      continue;
    }

    rows.push({ fold: false, index: i, groupStart: null });
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

/** Авторы, отсортированные по числу коммитов — для выбора, кого сворачивать. */
export function authorStats(layout: LayoutView): Array<{ id: number; name: string; count: number }> {
  const counts = new Map<number, number>();
  for (const id of layout.author_of) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, count]) => ({ id, name: layout.authors[id] ?? '?', count }))
    .sort((a, b) => b.count - a.count);
}
