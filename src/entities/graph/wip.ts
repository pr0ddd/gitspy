import type { Cols } from './columns';
import type { RowView } from '@/types';

export type WipContent = 'counters' | 'conflictBanner';

export const wipContent = (row: Extract<RowView, { kind: 'workingTree' }>): WipContent =>
  row.conflicts > 0 && row.inProgress ? 'conflictBanner' : 'counters';

export const wipInputShown = (row: RowView | null | undefined, firstVisibleRow: number): boolean =>
  row?.kind === 'workingTree' && firstVisibleRow === 0 && wipContent(row) === 'counters';

export const WIP_BADGES_W = 150;

export const wipInputWidth = (cols: Cols): number =>
  Math.max(0, cols.message.width - 24 - (cols.author.width > 0 ? 0 : WIP_BADGES_W));

export const wipBadgesX = (cols: Cols): number =>
  cols.author.width > 0
    ? cols.author.left + 8
    : cols.message.left + 12 + wipInputWidth(cols) + 12;
