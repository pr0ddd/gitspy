import { describe, expect, it } from 'vitest';
import {
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

describe('раскладка колонок', () => {
  it('колонки укладываются в список без дыр и нахлёстов', () => {
    const cols = layoutColumns(1400, {});
    expect(sumOf(cols)).toBe(1400);

    let edge = 0;
    for (const key of keys) {
      expect(cols[key].left).toBe(edge);
      edge += cols[key].width;
    }
  });

  it('сохранённая ширина уважается, разницу забирает сообщение', () => {
    const plain = layoutColumns(1400, {});
    const wide = layoutColumns(1400, { author: plain.author.width + 60 });

    expect(wide.author.width).toBe(plain.author.width + 60);
    expect(wide.message.width).toBe(plain.message.width - 60);
    expect(sumOf(wide)).toBe(1400);
  });

  it('граф не шевелится, когда тянут чужую границу', () => {
    const plain = layoutColumns(1400, {});
    for (const key of ['author', 'date', 'sha'] as const) {
      const after = layoutColumns(1400, { [key]: plain[key].width + 40 });
      expect(after.graph, key).toEqual(plain.graph);
    }
  });

  it('ни одна колонка не уходит под свой пол даже с мусором в хранилище', () => {
    const cols = layoutColumns(1400, { graph: 1, date: 3, sha: 0, branchTag: 2 });
    expect(cols.branchTag.width).toBeGreaterThanOrEqual(FLOORS.branchTag);
    expect(cols.graph.width).toBeGreaterThanOrEqual(FLOORS.graph);
    expect(cols.date.width).toBeGreaterThanOrEqual(FLOORS.date);
    expect(cols.sha.width).toBeGreaterThanOrEqual(FLOORS.sha);
  });

  it('в узком окне первым уступает граф, потом остальные до полов', () => {
    const cols = layoutColumns(700, { graph: 700 });
    expect(cols.message.width).toBeGreaterThanOrEqual(MESSAGE_FLOOR);
    for (const key of ['graph', 'author', 'date', 'sha'] as const) {
      expect(cols[key].width, key).toBeGreaterThanOrEqual(FLOORS[key]);
    }
  });

  it('в совсем узком окне ширины не становятся отрицательными', () => {
    const cols = layoutColumns(320, {});
    for (const key of keys) {
      expect(cols[key].width, key).toBeGreaterThanOrEqual(0);
    }
  });

  it('раскладка не зависит ни от чего, кроме входа', () => {
    expect(layoutColumns(1400, { author: 200 })).toEqual(layoutColumns(1400, { author: 200 }));
  });
});

describe('перетаскивание границ', () => {
  const roomy = { branchTag: 210, graph: 500, author: 160, date: 130, sha: 100 };

  it('граница ходит ровно за курсором по каждой из пяти границ', () => {
    const cols = layoutColumns(1400, roomy);
    dividers(cols).forEach((divider, at) => {
      for (const dx of [24, -24]) {
        const after = layoutColumns(1400, resized(roomy, cols, divider, dx));
        const moved = dividers(after)[at];
        expect(moved.x - divider.x, `${divider.take ?? divider.give} на ${dx}`).toBe(dx);
      }
    });
  });

  it('перетаскивание двигает только свою границу, соседние стоят', () => {
    const cols = layoutColumns(1400, roomy);
    dividers(cols).forEach((divider, at) => {
      const after = layoutColumns(1400, resized(roomy, cols, divider, 24));
      dividers(after).forEach((other, i) => {
        if (i === at) return;
        expect(other.x, `граница ${i} при перетаскивании ${at}`).toBe(dividers(cols)[i].x);
      });
    });
  });

  it('граница толще одного пикселя, иначе в неё не попасть', () => {
    const cols = layoutColumns(1400, {});
    const edge = cols.branchTag.width;
    expect(dividerAt(edge - 3, cols)?.take).toBe('branchTag');
    expect(dividerAt(edge + 3, cols)?.take).toBe('branchTag');
    expect(dividerAt(edge + 40, cols)).toBeNull();
  });

  it('тянуть ниже пола нельзя: граница стоит, а не пружинит', () => {
    const cols = layoutColumns(1400, roomy);
    const divider = dividers(cols).find((d) => d.give === 'sha')!;
    const stored = resized(roomy, cols, divider, 500);
    expect(stored.sha).toBe(FLOORS.sha);
    expect(stored.date).toBe(cols.date.width + (cols.sha.width - FLOORS.sha));
  });

  it('колонку нельзя растянуть так, чтобы сообщение ушло под пол', () => {
    const cols = layoutColumns(1400, {});
    const divider = dividers(cols).find((d) => d.take === 'graph')!;
    const after = layoutColumns(1400, resized({}, cols, divider, 5000));
    expect(after.message.width).toBeGreaterThanOrEqual(MESSAGE_FLOOR);
  });

  it('сброс возвращает колонку к ширине по умолчанию', () => {
    const stored = reset({ author: 300, date: 100 }, 'author');
    expect(stored).toEqual({ date: 100 });
    expect(layoutColumns(1400, stored).author.width).toBe(layoutColumns(1400, {}).author.width);
  });
});
