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

describe('список веток в шапке', () => {
  it('показывает только локальные ветки: переключаться можно на них', () => {
    const choices = branchChoices([branch('master'), remote('origin/master')], [], 'master');

    expect(choices.map((c) => c.ref.name)).toEqual(['master']);
  });

  it('сортирует по алфавиту без оглядки на регистр', () => {
    const choices = branchChoices(
      [branch('resize'), branch('Loader'), branch('avatars')],
      [],
      'avatars',
    );

    expect(
      choices.map((c) => c.ref.name),
      'заглавная буква не выбрасывает ветку в начало списка',
    ).toEqual(['avatars', 'Loader', 'resize']);
  });

  it('при нескольких рабочих деревьях их ветки идут первыми, главное — во главе', () => {
    const refs = [branch('feature'), branch('master'), branch('zebra'), branch('alpha')];
    const trees = [worktree('master', true), worktree('zebra')];

    const choices = branchChoices(refs, trees, 'master');

    expect(
      choices.map((c) => c.ref.name),
      'сначала ветка главного дерева, затем прочие деревья по алфавиту, затем обычные ветки',
    ).toEqual(['master', 'zebra', 'alpha', 'feature']);
    expect(
      choices[1].worktree?.path,
      'у ветки из дерева известен путь — по нему её и открывают',
    ).toBe('/trees/zebra');
  });

  it('единственное рабочее дерево не делит список: делить не на что', () => {
    const choices = branchChoices([branch('master', true)], [worktree('master', true)], 'master');

    expect(choices[0].worktree, 'при одном дереве ветка не помечается как «в дереве»').toBeNull();
    expect(choices[0].current).toBe(true);
  });

  it('фильтр ищет подстроку в любом регистре', () => {
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

describe('список репозиториев в шапке', () => {
  it('без поиска: избранные целиком, недавние без текущего и не длиннее четырёх', () => {
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
      'открытый репозиторий в «недавних» не повторяется, список короткий',
    ).toEqual(['quesk', 'react', 'shpion', 'agents']);
  });

  it('поиск отменяет деление на группы и ищет по всем известным, включая текущий', () => {
    const recent = [recentRepo('gitspy', true), recentRepo('quesk'), recentRepo('sixth')];

    const menu = repoMenu([], recent, '/src/gitspy', 'S');

    expect(menu.searching).toBe(true);
    if (!menu.searching) return;
    expect(menu.found.map((r) => r.name)).toEqual(['gitspy', 'quesk', 'sixth']);
  });

  it('уже открытые помечены: их не нужно открывать заново, к ним переключаются', () => {
    const menu = repoMenu(['/src/quesk'], [recentRepo('quesk')], '/src/gitspy');

    expect(menu.searching).toBe(false);
    if (menu.searching) return;
    expect(menu.recent[0].open).toBe(true);
  });
});
