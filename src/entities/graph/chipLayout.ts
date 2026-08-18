import type { Chip, ChipMark } from './chips';

export type ChipMetrics = {
  readonly pad: number;
  readonly markSize: number;
  readonly avatarSize: number;
  readonly pullSize: number;
  readonly gap: number;
};

export const markWidth = (_mark: ChipMark, metrics: ChipMetrics): number => metrics.avatarSize;

type Trail = {
  readonly marks: readonly ChipMark[];
  readonly hasPull: boolean;
};

const trailBlockWidth = (trail: Trail, metrics: ChipMetrics): number => {
  const marks = trail.marks.reduce(
    (sum, mark, at) => sum + markWidth(mark, metrics) + (at > 0 ? metrics.gap : 0),
    0,
  );
  return marks + (trail.hasPull ? (trail.marks.length ? metrics.gap : 0) + metrics.pullSize : 0);
};

export type PlacedChip = {
  readonly chip: Chip;
  readonly x: number;
  readonly w: number;
  readonly fullW: number;
  readonly text: string;
  readonly textX: number;
  readonly fullText: string;
  readonly marks: readonly ChipMark[];
  readonly marksX: number;
  readonly hasPull: boolean;
  readonly badge: boolean;
};

export type ChipOverflow = {
  readonly x: number;
  readonly w: number;
  readonly count: number;
  readonly chips: readonly Chip[];
};

export type PlacedChips = {
  readonly placed: PlacedChip[];
  readonly more: ChipOverflow | null;
};

export const FIRST_CHIP_X = 12;
export const CHIP_MARGIN_RIGHT = 6;
export const BADGE_PAD = 4;
const CHIP_SPACING = 4;
const ELLIPSIS = '…';

export const badgeWidth = (metrics: ChipMetrics): number => BADGE_PAD * 2 + metrics.avatarSize;

export const chipInset = (columnWidth: number, metrics: ChipMetrics): number =>
  Math.min(FIRST_CHIP_X, (columnWidth - badgeWidth(metrics)) / 2);

export const headPrefix = (chip: Chip): string => (chip.isHead ? '✓ ' : '');

const ellipsized = (measure: (text: string) => number, text: string, max: number): string => {
  if (measure(text) <= max) return text;
  const letters = Array.from(text);
  let lo = 0;
  let hi = letters.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(letters.slice(0, mid).join('') + ELLIPSIS) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? letters.slice(0, lo).join('') + ELLIPSIS : '';
};

const wantsPull = (chip: Chip, pullHeads: ReadonlySet<string>): boolean =>
  (chip.kind === 'localBranch' || chip.kind === 'remoteBranch') && pullHeads.has(chip.name);

type Shape = {
  readonly w: number;
  readonly text: string;
  readonly textOffset: number;
  readonly marksOffset: number;
  readonly trail: Trail;
  readonly badge: boolean;
};

const shaped = (
  measure: (text: string) => number,
  metrics: ChipMetrics,
  text: string,
  trail: Trail,
  badge: boolean,
): Shape => {
  const pad = badge ? BADGE_PAD : metrics.pad;
  const inkW = text ? measure(text) : 0;
  const textW = badge && text ? metrics.avatarSize : inkW;
  const block = trailBlockWidth(trail, metrics);
  const between = text && block ? metrics.gap : 0;
  const w = pad * 2 + textW + between + block;
  return {
    w,
    text,
    textOffset: pad + (textW - inkW) / 2,
    marksOffset: w - pad - block,
    trail,
    badge,
  };
};

const stretched = (shape: Shape, w: number): Shape => ({
  ...shape,
  w,
  marksOffset: shape.marksOffset + (w - shape.w),
});

const shorterTrails = (full: Trail): Trail[] => {
  const trails: Trail[] = [full];
  let trail = full;
  if (trail.hasPull) trails.push((trail = { marks: trail.marks, hasPull: false }));
  while (trail.marks.length > 1) {
    trails.push((trail = { marks: trail.marks.slice(0, -1), hasPull: false }));
  }
  return trails;
};

const badgeThatFits = (
  measure: (text: string) => number,
  metrics: ChipMetrics,
  check: string,
  fullTrail: Trail,
  avail: number,
): Shape | null => {
  for (const trail of shorterTrails(fullTrail)) {
    const shape = shaped(measure, metrics, check, trail, true);
    if (shape.w <= avail) return shape;
  }
  if (!check) return null;
  const alone = shaped(measure, metrics, check, { marks: [], hasPull: false }, true);
  return alone.w <= avail ? alone : null;
};

const smallestBadge = (
  measure: (text: string) => number,
  metrics: ChipMetrics,
  check: string,
  fullTrail: Trail,
): Shape =>
  shaped(measure, metrics, check, { marks: fullTrail.marks.slice(0, 1), hasPull: false }, true);

const placedFrom = (
  chip: Chip,
  shape: Shape,
  x: number,
  fullW: number,
  fullText: string,
): PlacedChip => ({
  chip,
  x,
  w: shape.w,
  fullW,
  text: shape.text,
  textX: x + shape.textOffset,
  fullText,
  marks: shape.trail.marks,
  marksX: x + shape.marksOffset,
  hasPull: shape.trail.hasPull,
  badge: shape.badge,
});

export function fullChip(
  chip: Chip,
  measure: (text: string) => number,
  metrics: ChipMetrics,
  pullHeads: ReadonlySet<string>,
  x = FIRST_CHIP_X,
): PlacedChip {
  const trail: Trail = { marks: chip.marks, hasPull: wantsPull(chip, pullHeads) };
  const fullText = headPrefix(chip) + chip.name;
  const shape = shaped(measure, metrics, fullText, trail, false);
  return placedFrom(chip, shape, x, shape.w, fullText);
}

export const stackChips = (
  chips: readonly Chip[],
  measure: (text: string) => number,
  metrics: ChipMetrics,
  pullHeads: ReadonlySet<string>,
  x: number,
): PlacedChip[] => chips.map((chip) => fullChip(chip, measure, metrics, pullHeads, x));

export const stackWidth = (stack: readonly PlacedChip[]): number =>
  stack.reduce((widest, row) => Math.max(widest, row.fullW), 0);

export const stackRowAt = (
  stack: readonly PlacedChip[],
  rowH: number,
  x: number,
  yFromTop: number,
): number | null => {
  const first = stack[0];
  if (!first || x < first.x || x >= first.x + stackWidth(stack) || yFromTop < 0) return null;
  const at = Math.floor(yFromTop / rowH);
  return at < stack.length ? at : null;
};

export function placeChips(
  chips: readonly Chip[],
  measure: (text: string) => number,
  columnWidth: number,
  metrics: ChipMetrics,
  pullHeads: ReadonlySet<string>,
): PlacedChips {
  const [chip, ...rest] = chips;
  if (!chip) return { placed: [], more: null };

  const fullTrail: Trail = { marks: chip.marks, hasPull: wantsPull(chip, pullHeads) };
  const prefix = headPrefix(chip);
  const check = prefix.trim();
  const fullText = prefix + chip.name;
  const full = shaped(measure, metrics, fullText, fullTrail, false);

  const usable = columnWidth - FIRST_CHIP_X - CHIP_MARGIN_RIGHT;
  const counterW = rest.length ? moreWidth(measure, rest.length) : 0;
  const counterSlot = rest.length ? CHIP_SPACING + counterW : 0;
  const availBeside = usable - counterSlot;

  const named = (): Shape | null => {
    if (full.w <= availBeside) return full;
    const nameMax =
      availBeside -
      metrics.pad * 2 -
      trailBlockWidth(fullTrail, metrics) -
      (fullTrail.marks.length || fullTrail.hasPull ? metrics.gap : 0) -
      (prefix ? measure(prefix) : 0);
    const name = ellipsized(measure, chip.name, nameMax);
    if (!name) return null;
    const shape = shaped(measure, metrics, prefix + name, fullTrail, false);
    return stretched(shape, Math.max(shape.w, availBeside));
  };

  const beside = named() ?? badgeThatFits(measure, metrics, check, fullTrail, availBeside);
  const shape =
    beside ??
    badgeThatFits(measure, metrics, check, fullTrail, usable) ??
    smallestBadge(measure, metrics, check, fullTrail);
  const withCounter = beside !== null && rest.length > 0;
  const x = chipInset(columnWidth, metrics);

  const placed = [placedFrom(chip, shape, x, full.w, fullText)];
  const more = withCounter
    ? { x: x + shape.w + CHIP_SPACING, w: counterW, count: rest.length, chips: rest }
    : null;
  return { placed, more };
}

export const moreLabel = (count: number): string => `+${count}`;

export const MORE_PAD = 5;

const moreWidth = (measure: (text: string) => number, count: number): number =>
  measure(moreLabel(Math.max(1, count))) + MORE_PAD * 2;

export const chipAt = (placed: readonly PlacedChip[], x: number): PlacedChip | null =>
  placed.find((p) => x >= p.x && x < p.x + p.w) ?? null;
