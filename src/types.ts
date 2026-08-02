export type LayoutView = {
  path: string;
  count: number;
  max_lane: number;
  head: number | null;
  truncated: boolean;
  read_ms: number;
  layout_ms: number;
  lanes: number[];
  colours: number[];

  kinds: number[];

  seg_offsets: number[];

  seg_kind: number[];
  seg_from: number[];
  seg_to: number[];
  seg_colour: number[];
  refs: RefView[];
};

export type RefKind = 'localBranch' | 'remoteBranch' | 'tag' | 'stash';

export type RefView = {
  name: string;
  kind: RefKind;
  commit: number;
  is_head: boolean;
};

export const NODE_KIND = {
  normal: 0,
  merge: 1,
  root: 2,
  open: 3,
} as const;

export const SEGMENT_KIND = {
  through: 0,
  branch: 1,
  merge: 2,
} as const;

export type RecentRepo = {
  path: string;
  name: string;
  opened_at: number;
  exists: boolean;
};

export type WorktreeView = {
  name: string;
  path: string;
  branch: string | null;
  is_main: boolean;
  is_locked: boolean;
};

export type CommitView = {
  index: number;
  hash: string;
  author: string;
  email: string;
  time: number;
  subject: string;
  body: string;
};
