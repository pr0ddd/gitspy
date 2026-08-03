import { describe, expect, it } from 'vitest';
import { chipAt, placeChips, type ChipMetrics } from './chipLayout';
import { chipsFor } from './chips';
import type { RefKind, RefView } from './types';

const ref = (name: string, kind: RefKind, patch: Partial<RefView> = {}): RefView => ({
  name,
  kind,
  commit: 0,
  oid: "refoid",
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
  ...patch,
});

const measure = (text: string) => text.length * 7;

const METRICS: ChipMetrics = { pad: 9, markSize: 13, pullSize: 11, gap: 4 };

const place = (
  refs: RefView[],
  room = 400,
  pullHeads: ReadonlySet<string> = new Set(),
) => placeChips(chipsFor(refs, ['origin']), measure, room, METRICS, pullHeads);

describe('раскладка чипов', () => {
  it('первый чип начинается с отступа, следующий — после зазора', () => {
    const placed = place([ref('a', 'localBranch'), ref('b', 'localBranch')]);

    expect(placed[0].x).toBe(12);
    expect(placed[1].x, 'зазор между чипами — 4px').toBe(12 + placed[0].w + 4);
  });

  it('ширина чипа — отступы, текст и хвост меток', () => {
    const [placed] = place([ref('wip', 'localBranch')]);

    const textW = measure('wip');
    const trail = METRICS.markSize + METRICS.gap;
    expect(placed.w).toBe(9 * 2 + textW + trail);
  });

  it('открытый PR удлиняет хвост на свой значок', () => {
    const [bare] = place([ref('wip', 'localBranch')]);
    const [withPull] = place([ref('wip', 'localBranch')], 400, new Set(['wip']));

    expect(withPull.hasPull).toBe(true);
    expect(withPull.w - bare.w).toBe(METRICS.pullSize + METRICS.gap);
  });

  it('в тесноте текст усечён, но полное имя чип помнит', () => {
    const long = 'very-long-branch-name-that-cannot-fit';
    const [placed] = place([ref(long, 'localBranch')], 120);

    expect(placed.text.endsWith('…'), 'на экране — усечённый текст').toBe(true);
    expect(placed.fullText).toBe(long);
    expect(placed.fullW, 'полная ширина шире показанной').toBeGreaterThan(placed.w);
  });

  it('когда места нет совсем, чипы дальше не раскладываются', () => {
    const placed = place([ref('a', 'localBranch'), ref('b', 'localBranch')], 40);

    expect(placed.length).toBeLessThan(2);
  });

  it('chipAt находит чип по координате, а мимо чипов — никого', () => {
    const placed = place([ref('a', 'localBranch'), ref('b', 'localBranch')]);

    expect(chipAt(placed, placed[0].x + 1)?.chip.name).toBe('a');
    expect(chipAt(placed, placed[1].x + 1)?.chip.name).toBe('b');
    expect(chipAt(placed, 0), 'слева от чипов пусто').toBeNull();
    expect(chipAt(placed, placed[1].x + placed[1].w + 5), 'справа пусто').toBeNull();
  });

  it('галочка HEAD входит и в показанный, и в полный текст', () => {
    const [placed] = place([ref('main', 'localBranch', { isHead: true })]);

    expect(placed.text).toBe('✓ main');
    expect(placed.fullText).toBe('✓ main');
  });
});
