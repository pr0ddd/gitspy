import type { RowView } from './types';

export type WipContent = 'counters' | 'conflictBanner';

export const wipContent = (row: Extract<RowView, { kind: 'workingTree' }>): WipContent =>
  row.conflicts > 0 && row.inProgress ? 'conflictBanner' : 'counters';

export const wipInputShown = (row: RowView | null | undefined, firstVisibleRow: number): boolean =>
  row?.kind === 'workingTree' && firstVisibleRow === 0 && wipContent(row) === 'counters';
