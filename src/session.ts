import type { RefView, RepoView, WorktreeView } from './types';

export type Session = {
  path: string;
  name: string;
  repo: RepoView | null;
  refsByCommit: Map<number, RefView[]>;
  worktrees: WorktreeView[];
  selected: number | null;
  loading: boolean;
};

export const repoName = (path: string): string =>
  path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

export const newSession = (path: string): Session => ({
  path,
  name: repoName(path),
  repo: null,
  refsByCommit: new Map(),
  worktrees: [],
  selected: null,
  loading: true,
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
