import { describe, expect, it } from 'vitest';
import {
  anchorAt,
  contentHeight,
  graphGeometry,
  graphLeft,
  graphRight,
  hashColumnLeft,
  hitTest,
  HEADER_H,
  maxScroll,
  maxScrollX,
  METRICS_AVATARS,
  METRICS_COMPACT,
  rowAtY,
  scrollForAnchor,
  visibleRange,
} from './scene';

const M = METRICS_AVATARS;
const WIDTH = 1400;
const HEIGHT = 800;

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
    const g = graphGeometry(M, 2, 0, WIDTH);
    expect(maxScrollX(M, 2, WIDTH)).toBe(0);
    expect(g.isStuck(0)).toBe(false);
    expect(g.nodeX(1)).toBe(g.laneAt(1));
  });

  it('широкий граф прижимает узлы за краем к краю', () => {
    const g = graphGeometry(M, 200, 0, WIDTH);
    expect(maxScrollX(M, 200, WIDTH)).toBeGreaterThan(0);
    expect(g.isStuck(199)).toBe(true);
    expect(g.nodeX(199)).toBeLessThanOrEqual(graphRight(WIDTH));
  });

  it('тень слева появляется только когда слева что-то скрыто', () => {
    expect(graphGeometry(M, 200, 0, WIDTH).leftShadow).toBe(false);
    expect(graphGeometry(M, 200, 40, WIDTH).leftShadow).toBe(true);
  });

  it('тень справа исчезает на самом правом краю', () => {
    const max = maxScrollX(M, 200, WIDTH);
    expect(graphGeometry(M, 200, 0, WIDTH).rightShadow).toBe(true);
    expect(graphGeometry(M, 200, max, WIDTH).rightShadow).toBe(false);
  });

  it('дорожки идут слева направо с шагом в ширину дорожки', () => {
    const g = graphGeometry(M, 10, 0, WIDTH);
    expect(g.laneAt(3) - g.laneAt(2)).toBe(M.laneW);
  });
});

describe('попадание клика', () => {
  it('справа от списка — мини-карта', () => {
    expect(hitTest(WIDTH - 10, 400, WIDTH, HEIGHT)).toBe('minimap');
  });

  it('колонка хеша копируется кликом, а не выделяется', () => {
    expect(hitTest(hashColumnLeft(WIDTH) + 10, 200, WIDTH, HEIGHT)).toBe('hash');
  });

  it('середина строки выбирает коммит', () => {
    expect(hitTest(600, 200, WIDTH, HEIGHT)).toBe('row');
  });

  it('в шапке ничего не выбирается', () => {
    expect(hitTest(600, 5, WIDTH, HEIGHT)).toBe('none');
  });

  it('полоса горизонтальной прокрутки перехватывает клик у нижнего края', () => {
    expect(hitTest(graphLeft() + 20, HEIGHT - 3, WIDTH, HEIGHT)).toBe('hscroll');
  });
});
