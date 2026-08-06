import { describe, expect, it } from 'vitest';
import { CHUNK, RowCache } from './rows';
import type { RowView, WindowView } from '@/types';

const row = (index: number): RowView => ({
  kind: 'commit',
  index,
  lane: index % 4,
  colour: index % 12,
  node: 0,
  hash: `hash-${index}`,
  author: 'pr0d',
  email: 'pr0d@example.com',
  time: 1_700_000_000 + index,
  subject: `коммит ${index}`,
  body: '',
});

const window = (chunk: number, length = CHUNK): WindowView => {
  const start = chunk * CHUNK;
  return {
    start,
    rows: Array.from({ length }, (_, i) => row(start + i)),
    segOffsets: Array.from({ length: length + 1 }, (_, i) => i),
    segKind: Array.from({ length }, () => 0),
    segFrom: Array.from({ length }, () => 0),
    segTo: Array.from({ length }, () => 0),
    segColour: Array.from({ length }, () => 0),
  };
};

describe('кэш строк', () => {
  it('пустой кэш не знает ни одной строки', () => {
    expect(new RowCache().row(0)).toBeNull();
  });

  it('отдаёт строку по её настоящему индексу, а не по смещению в полосе', () => {
    const cache = new RowCache();
    cache.put(3, window(3));
    const index = 3 * CHUNK + 17;
    expect(cache.row(index)?.index).toBe(index);
    expect((cache.row(index) as { hash: string }).hash).toBe(`hash-${index}`);
  });

  it('прочитанное не пропадает, когда приходит соседняя полоса', () => {
    const cache = new RowCache();
    cache.put(0, window(0));
    cache.put(1, window(1));
    expect(cache.row(5)).not.toBeNull();
    expect(cache.row(CHUNK + 5)).not.toBeNull();
  });

  it('просит только недостающие полосы и не просит их дважды', () => {
    const cache = new RowCache();
    const total = CHUNK * 10;

    const first = cache.missing(0, 40, total);
    expect(first).toEqual([0, 1]);

    expect(cache.missing(0, 40, total)).toEqual([]);

    cache.put(0, window(0));
    cache.put(1, window(1));
    expect(cache.missing(0, 40, total)).toEqual([]);
  });

  it('берёт полосу с запасом в обе стороны от видимого', () => {
    const cache = new RowCache();
    const total = CHUNK * 10;
    const middle = CHUNK * 5;
    expect(cache.missing(middle, middle + 10, total)).toEqual([4, 5, 6]);
  });

  it('не просит полос за пределами истории', () => {
    const cache = new RowCache();
    const total = CHUNK + 10;
    expect(cache.missing(0, 10, total)).toEqual([0, 1]);
  });

  it('вытесняет давние полосы, но не те, по которым только что читали', () => {
    const cache = new RowCache();
    for (let chunk = 0; chunk < 200; chunk++) cache.put(chunk, window(chunk));

    expect(cache.row(199 * CHUNK)).not.toBeNull();
    expect(cache.row(0)).toBeNull();
  });

  it('сегменты строки берутся по её индексу в полосе', () => {
    const cache = new RowCache();
    cache.put(2, window(2));
    const found = cache.segments(2 * CHUNK + 7);
    expect(found).not.toBeNull();
    expect(found?.from).toBe(7);
    expect(found?.to).toBe(8);
  });

  it('после очистки кэш снова пуст и снова просит полосы', () => {
    const cache = new RowCache();
    cache.put(0, window(0));
    cache.missing(0, 10, CHUNK * 4);
    cache.clear();
    expect(cache.row(0)).toBeNull();
    expect(cache.missing(0, 10, CHUNK * 4)).toEqual([0, 1]);
  });

  it('подмена целиком: старые полосы уходят, новая встаёт одним шагом', () => {
    const cache = new RowCache();
    cache.put(0, window(0));
    cache.put(3, window(3));
    cache.missing(3 * CHUNK, 3 * CHUNK + 10, CHUNK * 8);

    cache.replaceAll(window(0));

    const swapped = cache.row(5);
    expect(
      swapped?.kind === 'commit' && swapped.hash,
      'новая полоса на месте',
    ).toBe('hash-5');
    expect(cache.row(3 * CHUNK + 1), 'глубокие полосы прошлой жизни выброшены').toBeNull();
    expect(
      cache.missing(3 * CHUNK, 3 * CHUNK + 10, CHUNK * 8),
      'полосы в полёте забыты, их можно просить заново',
    ).toContain(3);
  });
});
