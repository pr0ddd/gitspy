import { describe, expect, it } from 'vitest';
import { rovingTabIndex, stepped } from '@/roving';

describe('шаг по списку', () => {
  it('движется на соседний элемент', () => {
    expect(stepped(2, 1, 10)).toBe(3);
    expect(stepped(2, -1, 10)).toBe(1);
  });

  it('с конца уходит в начало, чтобы список листался по кругу без остановки', () => {
    expect(stepped(9, 1, 10)).toBe(0);
    expect(stepped(0, -1, 10)).toBe(9);
  });

  it('единственный элемент остаётся на месте при любом шаге', () => {
    expect(stepped(0, 1, 1)).toBe(0);
    expect(stepped(0, -1, 1)).toBe(0);
  });

  it('без выбранного вниз берёт первый, вверх — последний', () => {
    expect(stepped(-1, 1, 10)).toBe(0);
    expect(stepped(-1, -1, 10)).toBe(9);
  });

  it('в пустом списке выбирать нечего', () => {
    expect(stepped(-1, 1, 0)).toBe(-1);
    expect(stepped(3, 1, 0)).toBe(-1);
  });
});

describe('точка входа по Tab', () => {
  it('в списке ровно одна остановка — выбранная строка', () => {
    expect(rovingTabIndex(2, 2)).toBe(0);
    expect(rovingTabIndex(2, 1)).toBe(-1);
    expect(rovingTabIndex(2, 3)).toBe(-1);
  });

  it('пока не выбрано ничего, Tab приводит на первую строку', () => {
    expect(rovingTabIndex(-1, 0)).toBe(0);
    expect(rovingTabIndex(-1, 1)).toBe(-1);
  });
});
