import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { clampPanel, PANEL_LIMITS, shareAfterDrag, useShareUnderCursor } from '@/resize';

const panelInARow = (span: number, along: 'x' | 'y'): HTMLElement => {
  const row = document.createElement('div');
  const panel = document.createElement('div');
  row.append(panel);
  row.getBoundingClientRect = () =>
    ({ width: along === 'x' ? span : 0, height: along === 'y' ? span : 0 }) as DOMRect;
  return panel;
};

describe('panel width limits', () => {
  it('a width inside the limits passes through untouched', () => {
    expect(clampPanel('sidebar', 300)).toBe(300);
    expect(clampPanel('details', 400)).toBe(400);
  });

  it('beyond the limits the width stops at the edge instead of springing back', () => {
    expect(clampPanel('sidebar', 50)).toBe(PANEL_LIMITS.sidebar.min);
    expect(clampPanel('sidebar', 9000)).toBe(PANEL_LIMITS.sidebar.max);
    expect(clampPanel('details', 0)).toBe(PANEL_LIMITS.details.min);
    expect(clampPanel('details', 9000)).toBe(PANEL_LIMITS.details.max);
  });

  it('garbage from storage turns into the default width', () => {
    expect(clampPanel('sidebar', Number.NaN)).toBe(PANEL_LIMITS.sidebar.fallback);
    expect(clampPanel('details', Number.NaN)).toBe(PANEL_LIMITS.details.fallback);
  });
});

describe('splitter that divides a row into shares', () => {
  it('the panel edge travels exactly as far as the cursor', () => {
    const panel = panelInARow(1000, 'x');
    const before = 0.46 * 1000;
    const after = shareAfterDrag(panel, 0.46, -200, 'x') * 1000;
    expect(
      after - before,
      'a splitter lagging behind the cursor reads as the app stalling, not as an arithmetic mistake',
    ).toBeCloseTo(200);
  });

  it('the share is measured against the row the panel sits in, not against the window', () => {
    const panel = panelInARow(1000, 'x');
    Object.defineProperty(window, 'innerWidth', { value: 1447, configurable: true });
    expect(
      shareAfterDrag(panel, 0.46, -200, 'x'),
      'the window is wider than the row by the sidebar, and a share taken from the window lags behind by exactly that difference',
    ).toBeCloseTo(0.66);
  });

  it('a panel that grows upwards is measured by the height of its row', () => {
    const panel = panelInARow(500, 'y');
    expect(
      shareAfterDrag(panel, 0.35, -50, 'y'),
      'the bottom dock is dragged by its top edge, so it is the row height that gets divided, not the width',
    ).toBeCloseTo(0.45);
  });

  it('a row with no size leaves the share alone', () => {
    const panel = panelInARow(0, 'x');
    expect(
      shareAfterDrag(panel, 0.4, -200, 'x'),
      'before the first layout there is nothing to divide, and the share must not fly off to infinity',
    ).toBe(0.4);
  });
});

describe('the share held under the cursor', () => {
  beforeEach(() => localStorage.clear());

  const dragged = (by: number) => {
    const hook = renderHook(() => useShareUnderCursor('split', 0.5, 0.2, 0.8));
    act(() => hook.result.current.begin());
    act(() => {
      hook.result.current.moved(panelInARow(1000, 'x'), by, 'x');
    });
    return hook;
  };

  it('a re-render in the middle of the gesture draws the panel where the cursor is, not where it stood before the gesture', () => {
    const hook = dragged(-100);
    hook.rerender();
    expect(
      hook.result.current.shown,
      'React holding the pre-drag share in a prop throws the panel back on every re-render, and that is exactly the stutter felt under the cursor',
    ).toBeCloseTo(0.6);
  });

  it('until the drag is released the gesture does not touch the stored preference', () => {
    dragged(-100);
    expect(
      localStorage.getItem('gitspy.split'),
      'writing the share on every move means writing to storage sixty times a second',
    ).toBeNull();
  });

  it('releasing stores the share that was left under the cursor', () => {
    const hook = dragged(-100);
    act(() => hook.result.current.commit());
    expect(JSON.parse(localStorage.getItem('gitspy.split') ?? 'null')).toBeCloseTo(0.6);
  });

  it('the share stays inside its limits no matter how far you drag', () => {
    const hook = dragged(-900);
    hook.rerender();
    expect(hook.result.current.shown, 'a panel must not eat its neighbour whole').toBeCloseTo(0.8);
  });
});

describe('splitter lands on a whole pixel', () => {
  it('the share gives the panel a whole width, not a fractional one', () => {
    const panel = panelInARow(1172, 'x');
    const share = shareAfterDrag(panel, 0.25, -222, 'x');
    expect(
      share * 1172,
      'a fractional width makes the browser rasterise borders and text on a shifted grid every frame',
    ).toBe(Math.round(share * 1172));
  });

  it('whole pixels do not stop the panel from following the cursor exactly', () => {
    const panel = panelInARow(1000, 'x');
    const before = 0.46 * 1000;
    const after = shareAfterDrag(panel, 0.46, -200, 'x') * 1000;
    expect(after - before, 'rounding to a pixel has no right to accumulate drift').toBeCloseTo(
      200,
      0,
    );
  });
});
