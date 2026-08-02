export type RefKind = 'localBranch' | 'remoteBranch' | 'tag' | 'stash';

export type RefView = {
  name: string;
  kind: RefKind;
  commit: number;
  isHead: boolean;
};

export type RepoView = {
  path: string;
  count: number;
  maxLane: number;
  head: number | null;
  truncated: boolean;
  readMs: number;
  layoutMs: number;
  minimap: number[];
  refs: RefView[];
};

export type CommitRow = {
  kind: 'commit';
  index: number;
  lane: number;
  colour: number;
  node: number;
  hash: string;
  author: string;
  email: string;
  time: number;
  subject: string;
  body: string;
};

export type WorkingTreeRow = {
  kind: 'workingTree';
  index: number;
  lane: number;
  colour: number;
  node: number;
  staged: number;
  unstaged: number;
};

export type RowView = CommitRow | WorkingTreeRow;

export type WindowView = {
  start: number;
  rows: RowView[];
  segOffsets: number[];
  segKind: number[];
  segFrom: number[];
  segTo: number[];
  segColour: number[];
};

export type RecentRepo = {
  path: string;
  name: string;
  openedAt: number;
  exists: boolean;
};

export type WorktreeView = {
  name: string;
  path: string;
  branch: string | null;
  isMain: boolean;
  isLocked: boolean;
};

export const NODE_KIND = { normal: 0, merge: 1, root: 2, open: 3 } as const;
export const SEGMENT_KIND = { through: 0, branch: 1, merge: 2 } as const;
