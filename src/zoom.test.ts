import { describe, expect, it } from 'vitest';
import { ZOOM_STEPS, zoomIn, zoomLabel, zoomOut } from '@/zoom';

describe('zoom steps', () => {
  it('ends the ladder at 80 and 300 percent', () => {
    expect(ZOOM_STEPS[0]).toBe(0.8);
    expect(ZOOM_STEPS[ZOOM_STEPS.length - 1]).toBe(3);
  });

  it('takes plus to the next rung and minus to the previous one', () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomIn(1.25)).toBe(1.5);
    expect(zoomOut(1.5)).toBe(1.25);
  });

  it('never lets a step off either end of the ladder', () => {
    expect(zoomIn(3)).toBe(3);
    expect(zoomOut(0.8)).toBe(0.8);
  });

  it('snaps a value between rungs onto the neighbouring one instead of breaking the step', () => {
    expect(zoomIn(1.07)).toBe(1.1);
    expect(zoomOut(1.07)).toBe(1);
  });

  it('labels the zoom in whole percent', () => {
    expect(zoomLabel(1)).toBe('100%');
    expect(zoomLabel(1.25)).toBe('125%');
    expect(zoomLabel(0.8)).toBe('80%');
  });
});
