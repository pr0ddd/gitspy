import { describe, expect, it } from 'vitest';
import { rovingTabIndex, stepped } from '@/shared/lib/roving';

describe('stepping through a list', () => {
  it('moves to the neighbouring item', () => {
    expect(stepped(2, 1, 10)).toBe(3);
    expect(stepped(2, -1, 10)).toBe(1);
  });

  it('wraps from the end to the start so the list cycles without ever stopping', () => {
    expect(stepped(9, 1, 10)).toBe(0);
    expect(stepped(0, -1, 10)).toBe(9);
  });

  it('leaves a lone item in place whichever way it is stepped', () => {
    expect(stepped(0, 1, 1)).toBe(0);
    expect(stepped(0, -1, 1)).toBe(0);
  });

  it('with nothing selected takes the first item going down and the last going up', () => {
    expect(stepped(-1, 1, 10)).toBe(0);
    expect(stepped(-1, -1, 10)).toBe(9);
  });

  it('has nothing to select in an empty list', () => {
    expect(stepped(-1, 1, 0)).toBe(-1);
    expect(stepped(3, 1, 0)).toBe(-1);
  });
});

describe('Tab entry point', () => {
  it('leaves exactly one tab stop in the list — the selected row', () => {
    expect(rovingTabIndex(2, 2)).toBe(0);
    expect(rovingTabIndex(2, 1)).toBe(-1);
    expect(rovingTabIndex(2, 3)).toBe(-1);
  });

  it('lands Tab on the first row while nothing is selected', () => {
    expect(rovingTabIndex(-1, 0)).toBe(0);
    expect(rovingTabIndex(-1, 1)).toBe(-1);
  });
});
