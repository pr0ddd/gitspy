import { describe, expect, it } from 'vitest';
import { CHUNK, RowCache } from './rows';
import type { RowView, WindowView } from '@/shared/api/types';

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
  committer: 'pr0d',
  committerEmail: 'pr0d@example.com',
  committerTime: 1_700_000_000 + index,
  subject: `commit ${index}`,
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

describe('row cache', () => {
  it('knows no row at all while it is empty', () => {
    expect(new RowCache().row(0)).toBeNull();
  });

  it('returns a row by its real index, not by its offset inside the chunk', () => {
    const cache = new RowCache();
    cache.put(3, window(3));
    const index = 3 * CHUNK + 17;
    expect(cache.row(index)?.index).toBe(index);
    expect((cache.row(index) as { hash: string }).hash).toBe(`hash-${index}`);
  });

  it('does not lose what was already read when a neighbouring chunk arrives', () => {
    const cache = new RowCache();
    cache.put(0, window(0));
    cache.put(1, window(1));
    expect(cache.row(5)).not.toBeNull();
    expect(cache.row(CHUNK + 5)).not.toBeNull();
  });

  it('asks only for the missing chunks, and never asks for the same one twice', () => {
    const cache = new RowCache();
    const total = CHUNK * 10;

    const first = cache.missing(0, 40, total);
    expect(first).toEqual([0, 1]);

    expect(cache.missing(0, 40, total)).toEqual([]);

    cache.put(0, window(0));
    cache.put(1, window(1));
    expect(cache.missing(0, 40, total)).toEqual([]);
  });

  it('takes a chunk of slack on both sides of the visible range', () => {
    const cache = new RowCache();
    const total = CHUNK * 10;
    const middle = CHUNK * 5;
    expect(cache.missing(middle, middle + 10, total)).toEqual([4, 5, 6]);
  });

  it('does not ask for chunks beyond the end of the history', () => {
    const cache = new RowCache();
    const total = CHUNK + 10;
    expect(cache.missing(0, 10, total)).toEqual([0, 1]);
  });

  it('evicts the oldest chunks, but not the ones just read from', () => {
    const cache = new RowCache();
    for (let chunk = 0; chunk < 200; chunk++) cache.put(chunk, window(chunk));

    expect(cache.row(199 * CHUNK)).not.toBeNull();
    expect(cache.row(0)).toBeNull();
  });

  it('takes the segments of a row by its index inside the chunk', () => {
    const cache = new RowCache();
    cache.put(2, window(2));
    const found = cache.segments(2 * CHUNK + 7);
    expect(found).not.toBeNull();
    expect(found?.from).toBe(7);
    expect(found?.to).toBe(8);
  });

  it('is empty again after a clear and asks for the chunks anew', () => {
    const cache = new RowCache();
    cache.put(0, window(0));
    cache.missing(0, 10, CHUNK * 4);
    cache.clear();
    expect(cache.row(0)).toBeNull();
    expect(cache.missing(0, 10, CHUNK * 4)).toEqual([0, 1]);
  });

  it('replaces everything in one step: the old chunks go and the new one takes their place', () => {
    const cache = new RowCache();
    cache.put(0, window(0));
    cache.put(3, window(3));
    cache.missing(3 * CHUNK, 3 * CHUNK + 10, CHUNK * 8);

    cache.replaceAll(window(0));

    const swapped = cache.row(5);
    expect(swapped?.kind === 'commit' && swapped.hash, 'the new chunk is in place').toBe('hash-5');
    expect(
      cache.row(3 * CHUNK + 1),
      'deep chunks from the previous life are thrown away',
    ).toBeNull();
    expect(
      cache.missing(3 * CHUNK, 3 * CHUNK + 10, CHUNK * 8),
      'chunks in flight are forgotten, so they can be asked for again',
    ).toContain(3);
  });
});
