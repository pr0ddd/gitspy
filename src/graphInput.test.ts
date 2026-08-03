import { describe, expect, it } from 'vitest';
import { layoutColumns } from './columns';
import { pointerTarget, type PointerScene } from './graphInput';
import { HEADER_H, listWidth, METRICS_AVATARS } from './scene';

const WIDTH = 1400;
const HEIGHT = 800;

const scene: PointerScene = {
  width: WIDTH,
  height: HEIGHT,
  cols: layoutColumns(listWidth(WIDTH), {}),
  metrics: METRICS_AVATARS,
  scrollY: 0,
  count: 100,
};

describe('маршрутизация указателя', () => {
  it('справа от списка всегда мини-карта, даже в шапке', () => {
    expect(pointerTarget(WIDTH - 10, 400, scene).kind).toBe('minimap');
    expect(pointerTarget(WIDTH - 10, 5, scene).kind).toBe('minimap');
  });

  it('граница в шапке ловится раньше строки под ней', () => {
    const edge = scene.cols.branchTag.width;
    const inHeader = pointerTarget(edge, HEADER_H - 5, scene);
    expect(inHeader.kind).toBe('divider');

    const below = pointerTarget(edge, HEADER_H + 10, scene);
    expect(below.kind).toBe('row');
  });

  it('шапка вне границ ничего не выбирает', () => {
    expect(pointerTarget(600, 5, scene).kind).toBe('none');
  });

  it('полоса прокрутки живёт только под графом', () => {
    const inside = scene.cols.graph.left + 20;
    const outside = scene.cols.message.left + 20;
    expect(pointerTarget(inside, HEIGHT - 3, scene).kind).toBe('hscroll');
    expect(pointerTarget(outside, HEIGHT - 3, scene).kind).toBe('row');
  });

  it('середина строки — выделение с её индексом', () => {
    const hit = pointerTarget(600, HEADER_H + scene.metrics.rowH * 2 + 1, scene);
    expect(hit).toEqual({ kind: 'row', index: 2 });
  });

  it('за концом истории строки нет', () => {
    const short: PointerScene = { ...scene, count: 1 };
    expect(pointerTarget(600, HEADER_H + scene.metrics.rowH * 5, short).kind).toBe('none');
  });
});
