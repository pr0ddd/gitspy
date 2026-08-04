import { describe, expect, it } from 'vitest';
import {
  scrollToReveal,
  HEADER_H,
  METRICS_AVATARS,
  METRICS_COMPACT,
  MINIMAP_TOP,
  anchorAt,
  contentHeight,
  graphGeometry,
  listWidth,
  maxScroll,
  maxScrollX,
  minimapBand,
  minimapFraction,
  rowAtY,
  rowTop,
  scrollForAnchor,
  visibleRange,
} from './scene';
import { layoutColumns } from './columns';

const M = METRICS_AVATARS;
const WIDTH = 1400;
const HEIGHT = 800;

const colsWith = (graph: number) => layoutColumns(listWidth(WIDTH), { graph });
const COLS = layoutColumns(listWidth(WIDTH), {});

describe('видимый диапазон', () => {
  it('в начале истории показывает строки с нуля', () => {
    const { first, last } = visibleRange(M, 0, HEIGHT, 1000);
    expect(first).toBe(0);
    expect(last).toBe(Math.ceil(contentHeight(HEIGHT) / M.rowH) + 1);
  });

  it('не выходит за конец истории', () => {
    const { last } = visibleRange(M, 1e9, HEIGHT, 40);
    expect(last).toBe(40);
  });

  it('сдвиг компенсирует часть строки, ушедшую под шапку', () => {
    const { shift } = visibleRange(M, M.rowH * 3 + 7, HEIGHT, 1000);
    expect(shift).toBe(HEADER_H - 7);
  });
});

describe('якорь прокрутки', () => {
  it('переживает смену плотности: коммит остаётся на месте', () => {
    const scrollY = 137 * M.rowH + 11;
    const anchor = anchorAt(M, scrollY);
    expect(anchor.index).toBe(137);

    const moved = scrollForAnchor(METRICS_COMPACT, anchor);
    expect(anchorAt(METRICS_COMPACT, moved).index).toBe(137);
  });

  it('туда и обратно даёт исходную прокрутку', () => {
    const scrollY = 42 * M.rowH + 9;
    expect(scrollForAnchor(M, anchorAt(M, scrollY))).toBeCloseTo(scrollY);
  });
});

describe('строка под курсором', () => {
  it('в шапке строки нет', () => {
    expect(rowAtY(M, HEADER_H - 1, 0, 100)).toBeNull();
  });

  it('первая строка начинается сразу под шапкой', () => {
    expect(rowAtY(M, HEADER_H + 1, 0, 100)).toBe(0);
  });

  it('за концом истории строки нет', () => {
    expect(rowAtY(M, HEADER_H + M.rowH * 50, 0, 10)).toBeNull();
  });
});

describe('предел прокрутки', () => {
  it('короткая история не прокручивается', () => {
    expect(maxScroll(M, 3, HEIGHT)).toBe(0);
  });

  it('длинная упирается в последнюю строку', () => {
    expect(maxScroll(M, 1000, HEIGHT)).toBe(1000 * M.rowH - contentHeight(HEIGHT));
  });
});

describe('геометрия графа', () => {
  it('узкий граф не прокручивается вбок и не прижимает узлы', () => {
    const g = graphGeometry(M, 2, 0, COLS);
    expect(maxScrollX(M, 2, COLS.graph.width)).toBe(0);
    expect(g.isStuck(0)).toBe(false);
    expect(g.nodeX(1)).toBe(g.laneAt(1));
  });

  it('широкий граф прижимает узлы за краем к краю', () => {
    const g = graphGeometry(M, 200, 0, COLS);
    expect(maxScrollX(M, 200, COLS.graph.width)).toBeGreaterThan(0);
    expect(g.isStuck(199)).toBe(true);
    expect(g.nodeX(199)).toBeLessThanOrEqual(COLS.graph.left + COLS.graph.width);
  });

  it('тень слева появляется только когда слева что-то скрыто', () => {
    expect(graphGeometry(M, 200, 0, COLS).leftShadow).toBe(false);
    expect(graphGeometry(M, 200, 40, COLS).leftShadow).toBe(true);
  });

  it('тень справа исчезает на самом правом краю', () => {
    const max = maxScrollX(M, 200, COLS.graph.width);
    expect(graphGeometry(M, 200, 0, COLS).rightShadow).toBe(true);
    expect(graphGeometry(M, 200, max, COLS).rightShadow).toBe(false);
  });

  it('дорожки идут слева направо с шагом в ширину дорожки', () => {
    const g = graphGeometry(M, 10, 0, COLS);
    expect(g.laneAt(3) - g.laneAt(2)).toBe(M.laneW);
  });
});

describe('место поля ввода в строке', () => {
  it('верх строки уезжает вверх ровно на прокрутку', () => {
    expect(rowTop(M, 0, 0)).toBe(HEADER_H);
    expect(rowTop(M, 0, 40)).toBe(HEADER_H - 40);
    expect(rowTop(M, 3, 0)).toBe(HEADER_H + 3 * M.rowH);
  });
});

describe('минимапа под шапкой', () => {
  it('щелчок в самый верх полосы не уводит выше начала', () => {
    expect(minimapFraction(0, 800)).toBe(0);
    expect(minimapFraction(MINIMAP_TOP, 800)).toBe(0);
  });

  it('щелчок в самый низ даёт конец истории', () => {
    expect(minimapFraction(800, 800)).toBe(1);
  });

  it('середина полосы — середина истории, а не середина окна', () => {
    const height = 800;
    const middle = MINIMAP_TOP + minimapBand(height) / 2;
    expect(minimapFraction(middle, height)).toBeCloseTo(0.5);
  });
});

describe('якорь дорожек', () => {
  it('порог прокручиваемости не сдвигает дорожки: ворота режут, а не двигают', () => {
    const narrow = colsWith(300);
    const wide = colsWith(1200);
    const before = graphGeometry(M, 20, 0, narrow);
    const after = graphGeometry(M, 20, 0, wide);
    expect(before.laneAt(0)).toBe(after.laneAt(0));
  });
});

describe('прижатие в покое', () => {
  it('без прокрутки ни один узел прокручиваемого графа не прижат', () => {
    const narrow = colsWith(200);
    const g = graphGeometry(M, 60, 0, narrow);
    expect(g.isStuck(0)).toBe(false);
    expect(g.nodeX(0)).toBe(g.laneAt(0));
  });
});

describe('узкая колонка графа', () => {
  it('шаг дорожек не зависит от ширины колонки — граница не зумит содержимое', () => {
    const wide = graphGeometry(M, 99, 0, colsWith(700));
    const tight = graphGeometry(M, 99, 0, colsWith(120));
    expect(wide.laneAt(1) - wide.laneAt(0)).toBe(M.laneW);
    expect(tight.laneAt(1) - tight.laneAt(0)).toBe(M.laneW);
  });

  it('не влезающие узлы прижимаются в колонну у края', () => {
    const g = graphGeometry(M, 99, 0, colsWith(70));
    expect(g.nodeX(60)).toBe(g.nodeX(99));
    expect(g.isStuck(60)).toBe(true);
  });
});

describe('минимальная колонка графа', () => {
  it('свободный аватар стоит на месте, пока край до него не доехал', () => {
    const roomy = graphGeometry(M, 99, 0, colsWith(200));
    const tight = graphGeometry(M, 99, 0, layoutColumns(listWidth(WIDTH), { graph: 34 }));
    expect(roomy.nodeX(0)).toBe(roomy.laneAt(0));
    expect(tight.nodeX(0)).toBe(tight.laneAt(0));
  });

  it('в минимуме колонна и свободный узел сливаются в один ряд', () => {
    const g = graphGeometry(M, 99, 0, layoutColumns(listWidth(WIDTH), { graph: 34 }));
    expect(Math.abs(g.nodeX(99) - g.nodeX(0))).toBeLessThanOrEqual(M.nodeR);
  });

  it('линии забранных дорожек вливаются в ось колонны, а не пропадают', () => {
    const g = graphGeometry(M, 99, 0, colsWith(90));
    expect(Math.min(g.laneAt(50), g.pinX)).toBe(g.pinX);
    expect(g.pinX).toBe(g.nodeX(50));
  });

  it('просторный граф ничего не прижимает', () => {
    const g = graphGeometry(M, 3, 0, colsWith(400));
    expect(g.pinX).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('дно колонки графа', () => {
  it('в минимуме все узлы становятся в один ряд без остатка', () => {
    const g = graphGeometry(M, 99, 0, layoutColumns(listWidth(WIDTH), { graph: 26 }));
    expect(g.nodeX(0)).toBe(g.nodeX(99));
  });
});

describe('проматывание к выделенной строке', () => {
  const H = HEADER_H + M.rowH * 10;
  const COUNT = 1000;

  it('видимую строку не трогает вовсе', () => {
    const at = M.rowH * 100;
    expect(scrollToReveal(M, 105, at, H, COUNT)).toBe(at);
  });

  it('строку выше окна подводит к его верхнему краю', () => {
    expect(scrollToReveal(M, 3, M.rowH * 100, H, COUNT)).toBe(M.rowH * 3);
  });

  it('строку ниже окна подводит к нижнему краю, а не к верхнему', () => {
    const got = scrollToReveal(M, 200, 0, H, COUNT);
    expect(got).toBe(M.rowH * 201 - M.rowH * 10);
    expect(got).toBeLessThan(M.rowH * 200);
  });

  it('последняя строка не уезжает за предел прокрутки', () => {
    const got = scrollToReveal(M, COUNT - 1, 0, H, COUNT);
    expect(got).toBe(maxScroll(M, COUNT, H));
  });

  it('в репозитории короче окна прокрутка остаётся нулевой', () => {
    expect(scrollToReveal(M, 2, 0, H, 3)).toBe(0);
  });
});
