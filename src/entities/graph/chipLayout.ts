import type { Chip, ChipMark } from './chips';

export type ChipMetrics = {
  readonly pad: number;
  readonly markSize: number;
  readonly avatarSize: number;
  readonly pullSize: number;
  readonly gap: number;
};

export const markWidth = (mark: ChipMark, metrics: ChipMetrics): number =>
  mark === 'remote' ? metrics.avatarSize : metrics.markSize;

export const trailWidth = (chip: Chip, hasPull: boolean, metrics: ChipMetrics): number =>
  chip.marks.reduce((sum, mark) => sum + markWidth(mark, metrics) + metrics.gap, 0) +
  (hasPull ? metrics.pullSize + metrics.gap : 0);

export const compactMarkWidth = (chip: Chip, metrics: ChipMetrics): number =>
  !chip.isHead && chip.marks.includes('remote') ? metrics.avatarSize : metrics.markSize;

export type PlacedChip = {
  readonly chip: Chip;
  readonly x: number;
  readonly w: number;
  readonly fullW: number;
  readonly text: string;
  readonly fullText: string;
  readonly hasPull: boolean;
  readonly compact: boolean;
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

const FIRST_CHIP_X = 12;
const CHIP_SPACING = 4;
const NAME_CAP = 170;
const SMALLEST_USEFUL = 30;

const shortened = (measure: (text: string) => number, text: string, max: number): string => {
  if (max <= 0) return '';
  if (measure(text) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(`${text.slice(0, mid)}…`) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : '';
};

const wantsPull = (chip: Chip, pullHeads: ReadonlySet<string>): boolean =>
  (chip.kind === 'localBranch' || chip.kind === 'remoteBranch') && pullHeads.has(chip.name);

export function placeChips(
  chips: readonly Chip[],
  measure: (text: string) => number,
  room: number,
  metrics: ChipMetrics,
  pullHeads: ReadonlySet<string>,
): PlacedChips {
  const placed: PlacedChip[] = [];
  let left = FIRST_CHIP_X;

  for (const [at, chip] of chips.entries()) {
    const hidden = chips.length - at;
    const counterW = at + 1 < chips.length ? moreWidth(measure, hidden - 1, metrics) : 0;
    const avail = room - left - counterW;

    const hasPull = wantsPull(chip, pullHeads);
    const trailW = trailWidth(chip, hasPull, metrics);
    const fullText = chip.isHead ? `✓ ${chip.name}` : chip.name;
    const text =
      avail < SMALLEST_USEFUL + trailW && at > 0
        ? ''
        : shortened(
            measure,
            fullText,
            Math.min(NAME_CAP, Math.max(0, avail - metrics.pad * 2 - trailW)),
          );

    if (!text && at > 0) {
      const rest = chips.slice(at);
      const w = moreWidth(measure, rest.length, metrics);
      return {
        placed,
        more: { x: left, w, count: rest.length, chips: rest },
      };
    }

    const compact = !text;
    const w = compact
      ? compactMarkWidth(chip, metrics) + metrics.pad
      : measure(text) + metrics.pad * 2 + trailW;
    placed.push({
      chip,
      x: left,
      w,
      fullW: measure(fullText) + metrics.pad * 2 + trailW,
      text,
      fullText,
      hasPull,
      compact,
    });
    left += w + CHIP_SPACING;
  }
  return { placed, more: null };
}

export const moreLabel = (count: number): string => `+${count}`;

const moreWidth = (
  measure: (text: string) => number,
  count: number,
  metrics: ChipMetrics,
): number => measure(moreLabel(Math.max(1, count))) + metrics.pad * 2;

export const chipAt = (placed: readonly PlacedChip[], x: number): PlacedChip | null =>
  placed.find((p) => x >= p.x && x < p.x + p.w) ?? null;
