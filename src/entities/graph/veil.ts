import { sameChip, type HoverChip } from './render/chips';

export const VEIL_DELAY_MS = 1000;
export const VEIL_RISE_MS = 500;
export const VEIL_FALL_MS = 200;

export type VeilLevels = ReadonlyMap<number, number>;

export const rowIsDimmed = (
  hover: HoverChip,
  row: number,
  owner: number | null | undefined,
): boolean => {
  if (row === hover.row) return false;
  return hover.reach !== 'branch' || owner !== hover.row;
};

const smoothstep = (t: number) => t * t * (3 - 2 * t);

export const veilStrength = (level: number): number => smoothstep(Math.min(1, Math.max(0, level)));

type RowState = { level: number; dimSince: number | null };

const advance = (state: RowState, wantDim: boolean, now: number, dt: number): boolean => {
  if (wantDim) {
    state.dimSince ??= now;
    if (now - state.dimSince >= VEIL_DELAY_MS) {
      state.level = Math.min(1, state.level + dt / VEIL_RISE_MS);
    }
    return state.level < 1;
  }
  state.dimSince = null;
  state.level = Math.max(0, state.level - dt / VEIL_FALL_MS);
  return state.level > 0;
};

export class HoverVeil {
  private rows = new Map<number, RowState>();
  private hovered: HoverChip | null = null;
  private last: number | null = null;
  private moving = false;

  get chip(): HoverChip | null {
    return this.hovered;
  }

  hover(chip: HoverChip | null, now: number): void {
    if (!this.moving) this.last = now;
    if (sameChip(this.hovered, chip)) return;
    this.hovered = chip;
    this.moving = true;
  }

  step(now: number, visible: readonly number[], dimmed: (row: number) => boolean): VeilLevels {
    const dt = this.last === null ? 0 : now - this.last;
    this.last = now;
    let moving = false;
    for (const row of visible) {
      const state = this.rows.get(row) ?? { level: 0, dimSince: null };
      if (advance(state, this.hovered !== null && dimmed(row), now, dt)) moving = true;
      if (state.level <= 0 && state.dimSince === null) this.rows.delete(row);
      else this.rows.set(row, state);
    }
    const shown = new Set(visible);
    for (const row of [...this.rows.keys()]) if (!shown.has(row)) this.rows.delete(row);
    this.moving = moving;
    const levels = new Map<number, number>();
    for (const [row, state] of this.rows) if (state.level > 0) levels.set(row, state.level);
    return levels;
  }

  settled(): boolean {
    return !this.moving;
  }
}
