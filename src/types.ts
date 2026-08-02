export type {
  ErrorView,
  RecentRepo,
  RefView,
  RepoView,
  RowView,
  WindowView,
  WorktreeView,
} from './generated';

export type { RefKindView as RefKind } from './generated';

export const NODE_KIND = { normal: 0, merge: 1, root: 2, open: 3 } as const;
export const SEGMENT_KIND = { through: 0, branch: 1, merge: 2 } as const;
