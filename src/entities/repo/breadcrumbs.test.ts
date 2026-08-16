import { describe, expect, it } from 'vitest';
import { branchChoices, repoMenu } from './breadcrumbs';
import type { RecentRepo, RefView, WorktreeView } from '@/types';

const branch = (name: string, isHead = false): RefView => ({
  name,
  kind: 'localBranch',
  commit: 0,
  oid: name,
  isHead,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
});

const remote = (name: string): RefView => ({ ...branch(name), kind: 'remoteBranch' });

const worktree = (branchName: string, isMain = false): WorktreeView => ({
  name: branchName,
  path: `/trees/${branchName}`,
  branch: branchName,
  isMain,
  isLocked: false,
});

describe('the branch list in the breadcrumbs', () => {
  it('shows local branches only: those are the ones you can switch to', () => {
    const choices = branchChoices([branch('master'), remote('origin/master')], [], 'master');

    expect(choices.map((c) => c.ref.name)).toEqual(['master']);
  });

  it('sorts alphabetically regardless of case', () => {
    const choices = branchChoices(
      [branch('resize'), branch('Loader'), branch('avatars')],
      [],
      'avatars',
    );

    expect(
      choices.map((c) => c.ref.name),
      'a capital letter does not throw a branch to the top of the list',
    ).toEqual(['avatars', 'Loader', 'resize']);
  });

  it('puts worktree branches first when there are several worktrees, the main one leading', () => {
    const refs = [branch('feature'), branch('master'), branch('zebra'), branch('alpha')];
    const trees = [worktree('master', true), worktree('zebra')];

    const choices = branchChoices(refs, trees, 'master');

    expect(
      choices.map((c) => c.ref.name),
      'the main worktree branch first, then the other worktrees alphabetically, then plain branches',
    ).toEqual(['master', 'zebra', 'alpha', 'feature']);
    expect(
      choices[1].worktree?.path,
      'a branch from a worktree carries its path, and that path is what opens it',
    ).toBe('/trees/zebra');
  });

  it('does not split the list when there is a single worktree: there is nothing to split it into', () => {
    const choices = branchChoices([branch('master', true)], [worktree('master', true)], 'master');

    expect(
      choices[0].worktree,
      'with a single worktree a branch is not marked as living in a worktree',
    ).toBeNull();
    expect(choices[0].current).toBe(true);
  });

  it('filters by substring in any case', () => {
    const choices = branchChoices([branch('Fix-Graph'), branch('master')], [], null, 'graph');

    expect(choices.map((c) => c.ref.name)).toEqual(['Fix-Graph']);
  });
});

const recentRepo = (name: string, favorite = false): RecentRepo => ({
  path: `/src/${name}`,
  name,
  openedAt: 0,
  exists: true,
  favorite,
});

describe('the repository list in the breadcrumbs', () => {
  it('without a search: all the favourites, and recents without the current one and no longer than four', () => {
    const recent = [
      recentRepo('gitspy', true),
      recentRepo('quesk'),
      recentRepo('react'),
      recentRepo('shpion'),
      recentRepo('agents'),
      recentRepo('sixth'),
    ];

    const menu = repoMenu([], recent, '/src/gitspy');

    expect(menu.searching).toBe(false);
    if (menu.searching) return;
    expect(menu.favorites.map((r) => r.name)).toEqual(['gitspy']);
    expect(
      menu.recent.map((r) => r.name),
      'the open repository is not repeated among the recents, and the list stays short',
    ).toEqual(['quesk', 'react', 'shpion', 'agents']);
  });

  it('a search drops the grouping and looks through every known repository, the current one included', () => {
    const recent = [recentRepo('gitspy', true), recentRepo('quesk'), recentRepo('sixth')];

    const menu = repoMenu([], recent, '/src/gitspy', 'S');

    expect(menu.searching).toBe(true);
    if (!menu.searching) return;
    expect(menu.found.map((r) => r.name)).toEqual(['gitspy', 'quesk', 'sixth']);
  });

  it('marks the already open ones: you switch to them instead of opening them again', () => {
    const menu = repoMenu(['/src/quesk'], [recentRepo('quesk')], '/src/gitspy');

    expect(menu.searching).toBe(false);
    if (menu.searching) return;
    expect(menu.recent[0].open).toBe(true);
  });
});
