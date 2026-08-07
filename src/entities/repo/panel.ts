import type { RowView } from '@/types';

export type Panel = 'commit' | 'workingTree' | 'loading' | 'noCommits';

export const panelFor = (row: RowView | null | undefined, count: number): Panel => {
  if (count <= 0) return 'noCommits';
  if (!row) return 'loading';
  return row.kind === 'workingTree' ? 'workingTree' : 'commit';
};
