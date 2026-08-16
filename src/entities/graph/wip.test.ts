import { describe, expect, it } from 'vitest';
import { wipBadgesX, wipContent, wipInputShown, wipInputWidth } from './wip';
import type { RowView } from '@/shared/api/types';

type WipRow = Extract<RowView, { kind: 'workingTree' }>;

const wip = (over: Partial<WipRow> = {}): WipRow => ({
  kind: 'workingTree',
  index: 0,
  lane: 0,
  colour: 0,
  node: 0,
  added: 1,
  modified: 2,
  deleted: 0,
  conflicts: 0,
  inProgress: null,
  ...over,
});

describe('the single decision about what the WIP row shows', () => {
  it('shows the counters when nothing is in progress', () => {
    expect(wipContent(wip())).toBe('counters');
  });

  it('replaces the counters with a banner during a conflicted merge', () => {
    expect(wipContent(wip({ conflicts: 2, inProgress: 'merge' }))).toBe('conflictBanner');
  });

  it('does not raise the banner for conflict letters alone, without a merge in progress', () => {
    expect(
      wipContent(wip({ conflicts: 1 })),
      'without MERGE_HEAD these are just files carrying a conflict status letter, no merge is running',
    ).toBe('counters');
  });

  it('shows the message input only over the counters', () => {
    expect(wipInputShown(wip(), 0)).toBe(true);
    expect(
      wipInputShown(wip({ conflicts: 2, inProgress: 'merge' }), 0),
      'committing in the middle of conflicts is impossible, so the input has nothing to do over the banner',
    ).toBe(false);
  });

  it('hides the input together with the row once it scrolls away, and on any other row', () => {
    expect(wipInputShown(wip(), 3)).toBe(false);
    expect(wipInputShown(undefined, 0)).toBe(false);
  });
});

import { layoutColumns } from './columns';

describe('WIP counters when columns are hidden', () => {
  it('puts the badges in the author column and gives the input the full width while the author is visible', () => {
    const cols = layoutColumns(1200, {}, new Set());

    expect(wipBadgesX(cols)).toBe(cols.author.left + 8);
    expect(wipInputWidth(cols)).toBe(cols.message.width - 24);
  });

  it('moves the badges into the message column when the author is hidden, and the input yields the room', () => {
    const cols = layoutColumns(1200, {}, new Set(['author', 'date', 'sha'] as const));

    expect(wipBadgesX(cols), 'the badges stay inside the message column').toBeLessThan(
      cols.message.left + cols.message.width,
    );
    expect(
      wipInputWidth(cols),
      'the input is shorter than the column by exactly the room reserved for the badges',
    ).toBe(cols.message.width - 24 - 150);
  });
});
