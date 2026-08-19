import { describe, expect, it } from 'vitest';

import { HEIGHT, ROWS, history, lanePath } from './History';

describe('the flowing history behind the banner', () => {
  const lanes = history(11);
  const trunks = lanes.filter((lane) => lane.forkFrom === undefined);
  const branches = lanes.filter((lane) => lane.forkFrom !== undefined);

  it('trunks span exactly one period, so two copies stacked meet without overlapping', () => {
    for (const trunk of trunks) {
      const d = lanePath(trunk);
      expect(d.startsWith(`M ${d.split(' ')[1]} 0 `), 'a trunk starts at the very top').toBe(true);
      expect(d.endsWith(` ${HEIGHT}`), 'a trunk ends at the very bottom').toBe(true);
    }
  });

  it('every branch forks after the first row and merges before the last, so the loop closes', () => {
    expect(branches.length, 'a history without branches is a set of rulers').toBeGreaterThan(4);
    for (const branch of branches) {
      expect(
        branch.from,
        'a branch that starts on row zero would hang open at the seam',
      ).toBeGreaterThan(0);
      expect(
        branch.to,
        'a branch still open on the last row would hang open at the seam',
      ).toBeLessThan(ROWS - 1);
    }
  });

  it('two branches never share a slot on the same row, so lines do not draw over each other', () => {
    const taken = new Map<string, number>();
    for (const branch of branches) {
      for (let row = branch.from; row <= branch.to; row += 1) {
        const key = `${row}:${branch.slot}`;
        expect(taken.has(key), `row ${row}, slot ${branch.slot} is drawn twice`).toBe(false);
        taken.set(key, 1);
      }
    }
  });
});
