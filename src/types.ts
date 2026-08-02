export type { ErrorView } from './generated/ErrorView';
export type { Operation } from './generated/Operation';
export type { OperationOutcome } from './generated/OperationOutcome';
export type { Progress } from './generated/Progress';
export type { RecentRepo } from './generated/RecentRepo';
export type { RefKindView as RefKind } from './generated/RefKindView';
export type { RefView } from './generated/RefView';
export type { RepoView } from './generated/RepoView';
export type { RowView } from './generated/RowView';
export type { WindowView } from './generated/WindowView';
export type { WorktreeView } from './generated/WorktreeView';

export const NODE_KIND = { normal: 0, merge: 1, root: 2, open: 3 } as const;
export const SEGMENT_KIND = { through: 0, branch: 1, merge: 2 } as const;
