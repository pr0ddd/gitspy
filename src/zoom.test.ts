import { describe, expect, it } from 'vitest';
import { ZOOM_STEPS, zoomForKey, zoomIn, zoomLabel, zoomOut } from './zoom';

describe('шаги масштаба', () => {
  it('края лестницы — 80 и 300 процентов', () => {
    expect(ZOOM_STEPS[0]).toBe(0.8);
    expect(ZOOM_STEPS[ZOOM_STEPS.length - 1]).toBe(3);
  });

  it('плюс идёт на следующую ступень, минус — на предыдущую', () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomIn(1.25)).toBe(1.5);
    expect(zoomOut(1.5)).toBe(1.25);
  });

  it('за края лестница не выпускает', () => {
    expect(zoomIn(3)).toBe(3);
    expect(zoomOut(0.8)).toBe(0.8);
  });

  it('значение между ступеней прижимается к соседней, а не ломает шаг', () => {
    expect(zoomIn(1.07)).toBe(1.1);
    expect(zoomOut(1.07)).toBe(1);
  });

  it('подпись — целые проценты', () => {
    expect(zoomLabel(1)).toBe('100%');
    expect(zoomLabel(1.25)).toBe('125%');
    expect(zoomLabel(0.8)).toBe('80%');
  });
});

describe('горячие клавиши масштаба', () => {
  it('плюс и равно растят, минус и подчёркивание уменьшают, ноль сбрасывает', () => {
    expect(zoomForKey('=', 1)).toBe(1.1);
    expect(zoomForKey('+', 1)).toBe(1.1);
    expect(zoomForKey('-', 1)).toBe(0.9);
    expect(zoomForKey('_', 1)).toBe(0.9);
    expect(zoomForKey('0', 2)).toBe(1);
  });

  it('чужие клавиши остаются чужими', () => {
    expect(zoomForKey('a', 1), 'иначе перехватим Cmd+A и прочие сочетания').toBeNull();
    expect(zoomForKey('9', 1)).toBeNull();
  });
});
