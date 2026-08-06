import { describe, expect, it } from 'vitest';
import { hostKindOf, splitRecent } from './startPage';
import type { RecentRepo } from '@/types';

const entry = (path: string, favorite = false): RecentRepo => ({
  path,
  name: path.split('/').pop() ?? path,
  openedAt: 1,
  exists: true,
  favorite,
});

describe('срез недавних на секции', () => {
  it('избранное не повторяется в недавних', () => {
    const { favorites, rest } = splitRecent([entry('/a', true), entry('/b')], '');
    expect(favorites.map((e) => e.path)).toEqual(['/a']);
    expect(rest.map((e) => e.path)).toEqual(['/b']);
  });

  it('фильтр режет обе секции и не смотрит на регистр', () => {
    const { favorites, rest } = splitRecent(
      [entry('/Alpha', true), entry('/beta'), entry('/Alps')],
      'al',
    );
    expect(favorites.map((e) => e.name)).toEqual(['Alpha']);
    expect(rest.map((e) => e.name)).toEqual(['Alps']);
  });
});

describe('вид хостинга по хосту origin', () => {
  it('узнаёт основные хостинги и их самостоятельные инстансы', () => {
    expect(hostKindOf('github.com')).toBe('github');
    expect(hostKindOf('gitlab.corp.dev')).toBe('gitlab');
    expect(hostKindOf('bitbucket.org')).toBe('bitbucket');
    expect(hostKindOf('git.corp.dev')).toBe('other');
    expect(hostKindOf(null)).toBe(null);
  });
});
