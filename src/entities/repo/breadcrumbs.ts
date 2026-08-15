import type { RecentRepo, RefView, WorktreeView } from '@/types';

const byLabel = new Intl.Collator(undefined, { sensitivity: 'accent' });

const matches = (label: string, needle: string): boolean =>
  label.toLowerCase().includes(needle.trim().toLowerCase());

export type BranchChoice = {
  ref: RefView;
  worktree: WorktreeView | null;
  main: boolean;
  current: boolean;
};

export function branchChoices(
  refs: readonly RefView[],
  worktrees: readonly WorktreeView[],
  currentBranch: string | null,
  filter = '',
): BranchChoice[] {
  const spread = worktrees.length > 1;
  const main = worktrees.find((tree) => tree.isMain) ?? null;

  const choices = refs
    .filter((ref) => ref.kind === 'localBranch')
    .filter((ref) => matches(ref.name, filter))
    .map((ref) => {
      const worktree = spread ? (worktrees.find((tree) => tree.branch === ref.name) ?? null) : null;
      return {
        ref,
        worktree,
        main: worktree !== null && main?.branch === ref.name,
        current: ref.isHead || ref.name === currentBranch,
      };
    });

  const inTree = choices.filter((choice) => choice.worktree !== null);
  const loose = choices.filter((choice) => choice.worktree === null);
  const sorted = (group: BranchChoice[]) =>
    [...group].sort((a, b) => byLabel.compare(a.ref.name, b.ref.name));

  return [
    ...sorted(inTree.filter((choice) => choice.main)),
    ...sorted(inTree.filter((choice) => !choice.main)),
    ...sorted(loose),
  ];
}

export type RepoChoice = { path: string; name: string; open: boolean };

export const RECENT_IN_MENU = 4;

const named = (path: string, name: string, open: boolean): RepoChoice => ({ path, name, open });

export type RepoMenu =
  | { searching: false; favorites: RepoChoice[]; recent: RepoChoice[] }
  | { searching: true; found: RepoChoice[] };

export function repoMenu(
  openPaths: readonly string[],
  recent: readonly RecentRepo[],
  currentPath: string,
  filter = '',
): RepoMenu {
  const openHere = new Set(openPaths);
  const known = recent.map((repo) => named(repo.path, repo.name, openHere.has(repo.path)));

  if (filter.trim().length > 0) {
    return { searching: true, found: known.filter((repo) => matches(repo.name, filter)) };
  }

  return {
    searching: false,
    favorites: recent
      .filter((repo) => repo.favorite)
      .map((repo) => named(repo.path, repo.name, openHere.has(repo.path))),
    recent: known.filter((repo) => repo.path !== currentPath).slice(0, RECENT_IN_MENU),
  };
}
