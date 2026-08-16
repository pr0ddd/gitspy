import { describe, expect, it } from 'vitest';
import { chipAt, placeChips, type ChipMetrics } from './chipLayout';
import { chipsFor } from './chips';
import type { RefKind, RefView } from '@/shared/api/types';

const ref = (name: string, kind: RefKind, patch: Partial<RefView> = {}): RefView => ({
  name,
  kind,
  commit: 0,
  oid: 'refoid',
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
  ...patch,
});

const measure = (text: string) => text.length * 7;

const METRICS: ChipMetrics = { pad: 9, markSize: 13, pullSize: 11, gap: 4 };

const place = (refs: RefView[], room = 400, pullHeads: ReadonlySet<string> = new Set()) =>
  placeChips(chipsFor(refs, ['origin']), measure, room, METRICS, pullHeads).placed;

describe('narrow column', () => {
  it('shrinks the first chip to a square with its mark instead of an empty pill', () => {
    const [one] = place([ref('feature/long-name', 'localBranch')], 40);

    expect(one.compact, 'the name does not fit, so the chip goes compact').toBe(true);
    expect(one.text).toBe('');
    expect(one.w, 'the square is the mark plus padding, with no room left for the name').toBe(
      METRICS.markSize + METRICS.pad,
    );
  });

  it('never goes compact in a roomy column', () => {
    const [one] = place([ref('main', 'localBranch')]);

    expect(one.compact).toBe(false);
    expect(one.text).toBe('main');
  });
});

describe('chip layout', () => {
  it('starts the first chip at the left inset and puts the next one after the gap', () => {
    const placed = place([ref('a', 'localBranch'), ref('b', 'localBranch')]);

    expect(placed[0].x).toBe(12);
    expect(placed[1].x, 'the gap between chips is 4px').toBe(12 + placed[0].w + 4);
  });

  it('sizes a chip as padding plus text plus the trailing marks', () => {
    const [placed] = place([ref('wip', 'localBranch')]);

    const textW = measure('wip');
    const trail = METRICS.markSize + METRICS.gap;
    expect(placed.w).toBe(9 * 2 + textW + trail);
  });

  it('an open pull request lengthens the trail by its own mark', () => {
    const [bare] = place([ref('wip', 'localBranch')]);
    const [withPull] = place([ref('wip', 'localBranch')], 400, new Set(['wip']));

    expect(withPull.hasPull).toBe(true);
    expect(withPull.w - bare.w).toBe(METRICS.pullSize + METRICS.gap);
  });

  it('truncates the text when space runs out but keeps the full name on the chip', () => {
    const long = 'very-long-branch-name-that-cannot-fit';
    const [placed] = place([ref(long, 'localBranch')], 120);

    expect(placed.text.endsWith('…'), 'the text drawn on screen is truncated').toBe(true);
    expect(placed.fullText).toBe(long);
    expect(placed.fullW, 'the full width is wider than the drawn one').toBeGreaterThan(placed.w);
  });

  it('collapses the chips that do not fit into a +N counter instead of into stubs', () => {
    const { placed, more } = placeChips(
      chipsFor(
        [ref('first', 'localBranch'), ref('second', 'localBranch'), ref('third', 'localBranch')],
        ['origin'],
      ),
      measure,
      110,
      METRICS,
      new Set(),
    );

    expect(placed.length, 'the first chip is shown in full').toBe(1);
    expect(more, 'the rest are hidden behind the counter').not.toBeNull();
    expect(more!.count).toBe(2);
    expect(
      more!.chips.map((c) => c.name),
      'the counter remembers every hidden chip',
    ).toEqual(['second', 'third']);
    expect(more!.x, 'the counter sits right after the last placed chip').toBe(
      placed[0].x + placed[0].w + 4,
    );
  });

  it('has no counter when every chip fits', () => {
    const { more } = placeChips(
      chipsFor([ref('a', 'localBranch'), ref('b', 'localBranch')], ['origin']),
      measure,
      400,
      METRICS,
      new Set(),
    );
    expect(more).toBeNull();
  });

  it('chipAt finds the chip under a coordinate and nothing beside the chips', () => {
    const placed = place([ref('a', 'localBranch'), ref('b', 'localBranch')]);

    expect(chipAt(placed, placed[0].x + 1)?.chip.name).toBe('a');
    expect(chipAt(placed, placed[1].x + 1)?.chip.name).toBe('b');
    expect(chipAt(placed, 0), 'nothing to the left of the chips').toBeNull();
    expect(chipAt(placed, placed[1].x + placed[1].w + 5), 'nothing to the right').toBeNull();
  });

  it('puts the HEAD check mark into both the drawn text and the full text', () => {
    const [placed] = place([ref('main', 'localBranch', { isHead: true })]);

    expect(placed.text).toBe('✓ main');
    expect(placed.fullText).toBe('✓ main');
  });
});
