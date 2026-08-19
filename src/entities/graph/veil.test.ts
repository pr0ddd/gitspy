import { describe, expect, it } from 'vitest';
import { HoverVeil, VEIL_DELAY_MS, VEIL_FALL_MS, VEIL_RISE_MS, veilStrength } from './veil';
import type { HoverChip } from './render/chips';

const main: HoverChip = { row: 0, at: 0, reach: 'branch' };
const other: HoverChip = { row: 5, at: 0, reach: 'branch' };
const ROWS = [0, 1, 2, 3, 4, 5];

const underMain = (row: number) => row >= 3;
const underOther = (row: number) => row >= 2 && row !== 5;

const run = (veil: HoverVeil, from: number, to: number, dimmed: (row: number) => boolean) => {
  let levels = veil.step(from, ROWS, dimmed);
  for (let t = from + 16; t <= to; t += 16) levels = veil.step(t, ROWS, dimmed);
  return levels;
};

const restOn = (veil: HoverVeil, chip: HoverChip, at: number, dimmed: (row: number) => boolean) => {
  veil.hover(chip, at);
  return run(veil, at, at + VEIL_DELAY_MS + VEIL_RISE_MS + 32, dimmed);
};

describe('the veil over rows outside the hovered branch', () => {
  it('a row waits a full delay before it starts to dim, so sweeping across chips changes nothing', () => {
    const veil = new HoverVeil();
    veil.hover(main, 0);
    expect(run(veil, 0, VEIL_DELAY_MS - 20, underMain).size, 'inside the delay').toBe(0);
    expect(veil.settled(), 'it is waiting, so the clock keeps running').toBe(false);
    veil.hover(null, VEIL_DELAY_MS - 20);
    expect(run(veil, VEIL_DELAY_MS, VEIL_DELAY_MS + 100, underMain).size, 'left in time').toBe(0);
    expect(veil.settled()).toBe(true);
  });

  it("each row's delay is its own: a row outside two chips in a row keeps its clock, a new one starts fresh", () => {
    const veil = new HoverVeil();
    veil.hover(main, 0);
    run(veil, 0, 500, underMain);
    veil.hover(other, 500);
    const at1300 = run(veil, 516, 1300, underOther);
    expect(at1300.get(5), 'outside main only, never got its second').toBeUndefined();
    expect(at1300.get(2), 'outside other only since 500, still waiting').toBeUndefined();
    expect(at1300.get(3), 'outside both since 0, so it dims from 1000 on').toBeGreaterThan(0);
  });

  it('resting on a chip dims each outside row over the rise time once its delay is up', () => {
    const veil = new HoverVeil();
    veil.hover(main, 0);
    const midway = run(veil, 0, VEIL_DELAY_MS + VEIL_RISE_MS / 2, underMain);
    expect(midway.get(3)).toBeGreaterThan(0.3);
    expect(midway.get(3)).toBeLessThan(0.7);
    expect(midway.get(1), 'a row of the hovered branch never dims').toBeUndefined();
    const up = run(
      veil,
      VEIL_DELAY_MS + VEIL_RISE_MS / 2 + 16,
      VEIL_DELAY_MS + VEIL_RISE_MS + 32,
      underMain,
    );
    expect(up.get(3)).toBe(1);
    expect(veil.settled()).toBe(true);
  });

  it('when the pointer leaves, dimmed rows come back at once over the fall time and the map empties', () => {
    const veil = new HoverVeil();
    const up = VEIL_DELAY_MS + VEIL_RISE_MS + 32;
    restOn(veil, main, 0, underMain);
    veil.hover(null, up);
    const falling = run(veil, up + 16, up + VEIL_FALL_MS / 2, underMain);
    expect(falling.get(4)).toBeGreaterThan(0.2);
    expect(falling.get(4)).toBeLessThan(0.8);
    expect(run(veil, up + VEIL_FALL_MS / 2 + 16, up + VEIL_FALL_MS + 32, underMain).size).toBe(0);
    expect(veil.settled()).toBe(true);
  });

  it('moving to a neighbouring chip: shared rows hold, freed rows come back at once, new rows wait their delay', () => {
    const veil = new HoverVeil();
    const up = VEIL_DELAY_MS + VEIL_RISE_MS + 32;
    restOn(veil, main, 0, underMain);
    veil.hover(other, up);
    const soon = run(veil, up + 16, up + VEIL_FALL_MS + 32, underOther);
    expect(soon.get(3), 'dimmed under both, it does not flicker').toBe(1);
    expect(soon.get(5), 'freed by the new chip, already back').toBeUndefined();
    expect(soon.get(2), 'newly outside, still inside its delay').toBeUndefined();
    const later = run(
      veil,
      up + VEIL_FALL_MS + 48,
      up + VEIL_DELAY_MS + VEIL_RISE_MS + 32,
      underOther,
    );
    expect(later.get(2), 'after its own delay it has dimmed').toBe(1);
  });

  it('a transition that starts after a long still spell still takes its full time', () => {
    const veil = new HoverVeil();
    restOn(veil, main, 0, underMain);
    expect(veil.settled(), 'fully up and resting: the clock stops ticking').toBe(true);
    veil.hover(null, 5000);
    const soonAfter = veil.step(5016, ROWS, underMain);
    expect(
      soonAfter.get(4),
      'sixteen milliseconds into the fall, still almost fully dimmed',
    ).toBeGreaterThan(0.9);
  });

  it('rows that scroll out of sight are forgotten, so the map stays the size of the screen', () => {
    const veil = new HoverVeil();
    restOn(veil, main, 0, underMain);
    const scrolled = veil.step(3000, [3, 4], underMain);
    expect([...scrolled.keys()]).toEqual([3, 4]);
  });

  it('the painted strength eases the linear level at both ends', () => {
    expect(veilStrength(0)).toBe(0);
    expect(veilStrength(1)).toBe(1);
    expect(veilStrength(0.5)).toBeCloseTo(0.5, 5);
    expect(veilStrength(0.1), 'a slow start').toBeLessThan(0.1);
    expect(veilStrength(0.9), 'a slow finish').toBeGreaterThan(0.9);
  });
});
