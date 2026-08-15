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

describe('пределы ширины панелей', () => {
  it('ширина внутри пределов проходит как есть', () => {
    expect(clampPanel('sidebar', 300)).toBe(300);
    expect(clampPanel('details', 400)).toBe(400);
  });

  it('за пределами ширина упирается в край, а не пружинит', () => {
    expect(clampPanel('sidebar', 50)).toBe(PANEL_LIMITS.sidebar.min);
    expect(clampPanel('sidebar', 9000)).toBe(PANEL_LIMITS.sidebar.max);
    expect(clampPanel('details', 0)).toBe(PANEL_LIMITS.details.min);
    expect(clampPanel('details', 9000)).toBe(PANEL_LIMITS.details.max);
  });

  it('мусор из хранилища превращается в ширину по умолчанию', () => {
    expect(clampPanel('sidebar', Number.NaN)).toBe(PANEL_LIMITS.sidebar.fallback);
    expect(clampPanel('details', Number.NaN)).toBe(PANEL_LIMITS.details.fallback);
  });
});

describe('разделитель, который делит ряд долями', () => {
  it('край панели проходит ровно столько же, сколько курсор', () => {
    const panel = panelInARow(1000, 'x');
    const before = 0.46 * 1000;
    const after = shareAfterDrag(panel, 0.46, -200, 'x') * 1000;
    expect(
      after - before,
      'разделитель, отстающий от курсора, читается как торможение приложения, а не как ошибка счёта',
    ).toBeCloseTo(200);
  });

  it('доля считается от ряда, в котором стоит панель, а не от окна', () => {
    const panel = panelInARow(1000, 'x');
    Object.defineProperty(window, 'innerWidth', { value: 1447, configurable: true });
    expect(
      shareAfterDrag(panel, 0.46, -200, 'x'),
      'окно шире ряда на боковую панель, и доля от него отстаёт на эту разницу',
    ).toBeCloseTo(0.66);
  });

  it('панель, растущую вверх, ряд меряет высотой', () => {
    const panel = panelInARow(500, 'y');
    expect(
      shareAfterDrag(panel, 0.35, -50, 'y'),
      'нижний док тянут за верхнюю кромку — делится высота ряда, не ширина',
    ).toBeCloseTo(0.45);
  });

  it('ряд без размера оставляет долю в покое', () => {
    const panel = panelInARow(0, 'x');
    expect(
      shareAfterDrag(panel, 0.4, -200, 'x'),
      'до первой раскладки делить нечего, и доля не должна улетать в бесконечность',
    ).toBe(0.4);
  });
});

describe('доля, которую держит курсор', () => {
  beforeEach(() => localStorage.clear());

  const dragged = (by: number) => {
    const hook = renderHook(() => useShareUnderCursor('split', 0.5, 0.2, 0.8));
    act(() => hook.result.current.begin());
    act(() => {
      hook.result.current.moved(panelInARow(1000, 'x'), by, 'x');
    });
    return hook;
  };

  it('перерисовка посреди жеста рисует панель там, где курсор, а не там, где она была до жеста', () => {
    const hook = dragged(-100);
    hook.rerender();
    expect(
      hook.result.current.shown,
      'React с довраговой долей в пропе отбрасывает панель назад каждым перерендером — это и есть рывки под курсором',
    ).toBeCloseTo(0.6);
  });

  it('до отпускания жест не трогает сохранённую настройку', () => {
    dragged(-100);
    expect(
      localStorage.getItem('gitspy.split'),
      'запись доли на каждом движении — это запись в хранилище шестьдесят раз в секунду',
    ).toBeNull();
  });

  it('отпускание сохраняет ту долю, что осталась под курсором', () => {
    const hook = dragged(-100);
    act(() => hook.result.current.commit());
    expect(JSON.parse(localStorage.getItem('gitspy.split') ?? 'null')).toBeCloseTo(0.6);
  });

  it('доля не выходит за пределы, как далеко ни тяни', () => {
    const hook = dragged(-900);
    hook.rerender();
    expect(hook.result.current.shown, 'панель не должна съедать соседнюю целиком').toBeCloseTo(0.8);
  });
});

describe('разделитель встаёт на целый пиксель', () => {
  it('доля даёт панели целую ширину, а не дробную', () => {
    const panel = panelInARow(1172, 'x');
    const share = shareAfterDrag(panel, 0.25, -222, 'x');
    expect(
      share * 1172,
      'дробная ширина заставляет браузер каждый кадр растрировать рамки и текст на сдвинутой сетке',
    ).toBe(Math.round(share * 1172));
  });

  it('целые пиксели не мешают панели идти ровно за курсором', () => {
    const panel = panelInARow(1000, 'x');
    const before = 0.46 * 1000;
    const after = shareAfterDrag(panel, 0.46, -200, 'x') * 1000;
    expect(after - before, 'округление до пикселя не имеет права копить снос').toBeCloseTo(200, 0);
  });
});
