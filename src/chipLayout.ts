import type { Chip } from './chips';

export type ChipMetrics = {
  readonly pad: number;
  readonly markSize: number;
  readonly pullSize: number;
  readonly gap: number;
};

export type PlacedChip = {
  readonly chip: Chip;
  readonly x: number;
  readonly w: number;
  readonly fullW: number;
  readonly text: string;
  readonly fullText: string;
  readonly hasPull: boolean;
};

const FIRST_CHIP_X = 12;
const CHIP_SPACING = 4;
const NAME_CAP = 170;
const BARE_CHIP_W = 18;
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
): PlacedChip[] {
  const placed: PlacedChip[] = [];
  let left = FIRST_CHIP_X;

  for (const chip of chips) {
    const avail = room - left;
    if (avail < 10) break;

    const hasPull = wantsPull(chip, pullHeads);
    const trailW =
      chip.marks.length * (metrics.markSize + metrics.gap) +
      (hasPull ? metrics.pullSize + metrics.gap : 0);
    const fullText = chip.isHead ? `✓ ${chip.name}` : chip.name;
    const text =
      avail < SMALLEST_USEFUL + trailW
        ? ''
        : shortened(measure, fullText, Math.min(NAME_CAP, avail - metrics.pad * 2 - trailW));
    const w = text
      ? measure(text) + metrics.pad * 2 + trailW
      : Math.min(avail, BARE_CHIP_W);

    placed.push({
      chip,
      x: left,
      w,
      fullW: measure(fullText) + metrics.pad * 2 + trailW,
      text,
      fullText,
      hasPull,
    });
    left += w + CHIP_SPACING;
  }
  return placed;
}

export const chipAt = (placed: readonly PlacedChip[], x: number): PlacedChip | null =>
  placed.find((p) => x >= p.x && x < p.x + p.w) ?? null;
