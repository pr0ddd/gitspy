import type { ConflictBlock, Picks } from './conflictFile';

export type ConflictSide = 'a' | 'b';

export type BlockPlace = {
  readonly at: number;
  readonly from: number;
  readonly to: number;
};

export type PaneLayout = {
  readonly text: string;
  readonly places: readonly BlockPlace[];
};

export type Origin = {
  readonly line: number;
  readonly side: ConflictSide | 'base';
  readonly at: number;
  readonly index: number;
};

export type OutputLayout = PaneLayout & {
  readonly origins: readonly Origin[];
};

const linesOf = (block: Extract<ConflictBlock, { kind: 'conflict' }>, side: ConflictSide) =>
  side === 'a' ? block.ours : block.theirs;

const pickOf = (picks: Picks, at: number) =>
  picks[at] ?? { a: new Set<number>(), b: new Set<number>() };

export function paneLayout(blocks: readonly ConflictBlock[], side: ConflictSide): PaneLayout {
  const lines: string[] = [];
  const places: BlockPlace[] = [];
  blocks.forEach((block, at) => {
    if (block.kind === 'common') {
      lines.push(...block.lines);
      return;
    }
    const own = linesOf(block, side);
    places.push({ at, from: lines.length + 1, to: lines.length + own.length });
    lines.push(...own);
  });
  return { text: lines.join('\n'), places };
}

export function outputLayout(blocks: readonly ConflictBlock[], picks: Picks): OutputLayout {
  const lines: string[] = [];
  const places: BlockPlace[] = [];
  const origins: Origin[] = [];
  blocks.forEach((block, at) => {
    if (block.kind === 'common') {
      lines.push(...block.lines);
      return;
    }
    const pick = pickOf(picks, at);
    const from = lines.length + 1;
    if (pick.a.size === 0 && pick.b.size === 0) {
      block.base.forEach((line, i) => {
        lines.push(line);
        origins.push({ line: lines.length, side: 'base', at, index: i });
      });
      places.push({ at, from, to: lines.length });
      return;
    }
    block.ours.forEach((line, i) => {
      if (!pick.a.has(i)) return;
      lines.push(line);
      origins.push({ line: lines.length, side: 'a', at, index: i });
    });
    block.theirs.forEach((line, i) => {
      if (!pick.b.has(i)) return;
      lines.push(line);
      origins.push({ line: lines.length, side: 'b', at, index: i });
    });
    places.push({ at, from, to: lines.length });
  });
  return { text: lines.join('\n'), places, origins };
}

export const blockLength = (place: BlockPlace): number => Math.max(0, place.to - place.from + 1);

export type GutterHit = { readonly at: number; readonly index: number | null };

export function gutterTarget(pane: PaneLayout, line: number): GutterHit | null {
  for (const place of pane.places) {
    if (line >= place.from && line <= place.to) return { at: place.at, index: line - place.from };
    if (blockLength(place) === 0 && line === place.from) return { at: place.at, index: null };
  }
  return null;
}

export const blockState = (
  block: Extract<ConflictBlock, { kind: 'conflict' }>,
  side: ConflictSide,
  picks: Picks,
  at: number,
): 'none' | 'some' | 'all' => {
  const chosen = pickOf(picks, at)[side].size;
  const total = linesOf(block, side).length;
  if (chosen === 0) return 'none';
  return chosen >= total ? 'all' : 'some';
};

export function withBlock(
  picks: Picks,
  blocks: readonly ConflictBlock[],
  side: ConflictSide,
  at: number,
  take: boolean,
): Picks {
  const block = blocks[at];
  if (!block || block.kind !== 'conflict') return picks;
  const pick = pickOf(picks, at);
  const all = new Set(linesOf(block, side).map((_, i) => i));
  return { ...picks, [at]: { ...pick, [side]: take ? all : new Set<number>() } };
}

export function withLine(picks: Picks, side: ConflictSide, at: number, index: number): Picks {
  const pick = pickOf(picks, at);
  const next = new Set(pick[side]);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return { ...picks, [at]: { ...pick, [side]: next } };
}

export function withEverySide(
  picks: Picks,
  blocks: readonly ConflictBlock[],
  side: ConflictSide,
  take: boolean,
): Picks {
  return blocks.reduce(
    (acc, block, at) => (block.kind === 'conflict' ? withBlock(acc, blocks, side, at, take) : acc),
    picks,
  );
}
