import type { Meta } from './render';
import type { LayoutView, RefView, WorktreeView } from './types';

export type Session = {
  path: string;
  name: string;
  layout: LayoutView | null;
  meta: Meta;
  refsByCommit: Map<number, RefView[]>;
  worktrees: WorktreeView[];
  selected: number | null;
  loading: boolean;
  openMs: number | null;
  metaMs: number | null;
};

export const emptyMeta = (): Meta => ({
  hash: [],
  author: [],
  email: [],
  time: [],
  subject: [],
  body: [],
});

export const repoName = (path: string): string =>
  path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

export const newSession = (path: string): Session => ({
  path,
  name: repoName(path),
  layout: null,
  meta: emptyMeta(),
  refsByCommit: new Map(),
  worktrees: [],
  selected: null,
  loading: true,
  openMs: null,
  metaMs: null,
});

export const groupRefsByCommit = (refs: RefView[]): Map<number, RefView[]> => {
  const byCommit = new Map<number, RefView[]>();
  for (const ref of refs) {
    const list = byCommit.get(ref.commit);
    if (list) list.push(ref);
    else byCommit.set(ref.commit, [ref]);
  }
  return byCommit;
};
