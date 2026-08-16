import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HIDDEN,
  dividerAt,
  dividers,
  FLOORS,
  layoutColumns,
  MESSAGE_FLOOR,
  reset,
  resized,
  type Cols,
} from './columns';

const keys = ['branchTag', 'graph', 'message', 'author', 'date', 'sha'] as const;

const sumOf = (cols: Cols): number => keys.reduce((total, key) => total + cols[key].width, 0);

describe('column layout', () => {
  it('lays the columns out edge to edge with no gaps and no overlaps', () => {
    const cols = layoutColumns(1400, {});
    expect(sumOf(cols)).toBe(1400);

    let edge = 0;
    for (const key of keys) {
      expect(cols[key].left).toBe(edge);
      edge += cols[key].width;
    }
  });

  it('honours a stored width and lets the message column absorb the difference', () => {
    const plain = layoutColumns(1400, {});
    const wide = layoutColumns(1400, { author: plain.author.width + 60 });

    expect(wide.author.width).toBe(plain.author.width + 60);
    expect(wide.message.width).toBe(plain.message.width - 60);
    expect(sumOf(wide)).toBe(1400);
  });

  it('keeps the graph column still while another divider is dragged', () => {
    const plain = layoutColumns(1400, {});
    for (const key of ['author', 'date', 'sha'] as const) {
      const after = layoutColumns(1400, { [key]: plain[key].width + 40 });
      expect(after.graph, key).toEqual(plain.graph);
    }
  });

  it('keeps every column at or above its floor even with junk in the stored widths', () => {
    const cols = layoutColumns(1400, { graph: 1, date: 3, sha: 0, branchTag: 2 });
    expect(cols.branchTag.width).toBeGreaterThanOrEqual(FLOORS.branchTag);
    expect(cols.graph.width).toBeGreaterThanOrEqual(FLOORS.graph);
    expect(cols.date.width).toBeGreaterThanOrEqual(FLOORS.date);
    expect(cols.sha.width).toBeGreaterThanOrEqual(FLOORS.sha);
  });

  it('gives up the graph column first in a narrow window, then the rest down to their floors', () => {
    const cols = layoutColumns(700, { graph: 700 });
    expect(cols.message.width).toBeGreaterThanOrEqual(MESSAGE_FLOOR);
    for (const key of ['graph', 'author', 'date', 'sha'] as const) {
      expect(cols[key].width, key).toBeGreaterThanOrEqual(FLOORS[key]);
    }
  });

  it('never lets a width go negative, however narrow the window is', () => {
    const cols = layoutColumns(320, {});
    for (const key of keys) {
      expect(cols[key].width, key).toBeGreaterThanOrEqual(0);
    }
  });

  it('depends on nothing but its input', () => {
    expect(layoutColumns(1400, { author: 200 })).toEqual(layoutColumns(1400, { author: 200 }));
  });
});

describe('dragging the dividers', () => {
  const roomy = { branchTag: 210, graph: 500, author: 160, date: 130, sha: 100 };

  it('follows the cursor exactly, on each of the five dividers', () => {
    const cols = layoutColumns(1400, roomy);
    dividers(cols).forEach((divider, at) => {
      for (const dx of [24, -24]) {
        const after = layoutColumns(1400, resized(roomy, cols, divider, dx));
        const moved = dividers(after)[at];
        expect(moved.x - divider.x, `${divider.take ?? divider.give} by ${dx}`).toBe(dx);
      }
    });
  });

  it('moves only the dragged divider and leaves the neighbouring ones in place', () => {
    const cols = layoutColumns(1400, roomy);
    dividers(cols).forEach((divider, at) => {
      const after = layoutColumns(1400, resized(roomy, cols, divider, 24));
      dividers(after).forEach((other, i) => {
        if (i === at) return;
        expect(other.x, `divider ${i} while dragging ${at}`).toBe(dividers(cols)[i].x);
      });
    });
  });

  it('makes the divider thicker than one pixel, otherwise it cannot be hit', () => {
    const cols = layoutColumns(1400, {});
    const edge = cols.branchTag.width;
    expect(dividerAt(edge - 3, cols)?.take).toBe('branchTag');
    expect(dividerAt(edge + 3, cols)?.take).toBe('branchTag');
    expect(dividerAt(edge + 40, cols)).toBeNull();
  });

  it('stops the divider at the floor instead of letting it spring back', () => {
    const cols = layoutColumns(1400, roomy);
    const divider = dividers(cols).find((d) => d.give === 'sha')!;
    const stored = resized(roomy, cols, divider, 500);
    expect(stored.sha).toBe(FLOORS.sha);
    expect(stored.date).toBe(cols.date.width + (cols.sha.width - FLOORS.sha));
  });

  it('cannot stretch a column far enough to push the message column below its floor', () => {
    const cols = layoutColumns(1400, {});
    const divider = dividers(cols).find((d) => d.take === 'graph')!;
    const after = layoutColumns(1400, resized({}, cols, divider, 5000));
    expect(after.message.width).toBeGreaterThanOrEqual(MESSAGE_FLOOR);
  });

  it('reset returns a column to its default width', () => {
    const stored = reset({ author: 300, date: 100 }, 'author');
    expect(stored).toEqual({ date: 100 });
    expect(layoutColumns(1400, stored).author.width).toBe(layoutColumns(1400, {}).author.width);
  });
});

describe('hidden columns', () => {
  const hidden = new Set<'branchTag' | 'author' | 'date' | 'sha'>(['author', 'date', 'sha']);

  it('gives a hidden column zero width and hands the space to the message column', () => {
    const shown = layoutColumns(1200, {}, new Set());
    const trimmed = layoutColumns(1200, {}, hidden);

    expect(trimmed.author.width).toBe(0);
    expect(trimmed.date.width).toBe(0);
    expect(trimmed.sha.width).toBe(0);
    expect(trimmed.message.width, 'the freed space goes to the message column').toBeGreaterThan(
      shown.message.width,
    );
  });

  it('offers no divider that would resize a hidden column', () => {
    const cols = layoutColumns(1200, {}, hidden);
    const involved = dividers(cols).flatMap((d) => [d.take, d.give]);

    expect(involved).not.toContain('author');
    expect(involved).not.toContain('date');
    expect(involved).not.toContain('sha');
  });

  it('hides author, date and sha by default', () => {
    expect([...DEFAULT_HIDDEN].sort()).toEqual(['author', 'date', 'sha']);
  });
});
