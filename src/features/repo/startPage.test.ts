import { describe, expect, it } from 'vitest';
import { hostKindOf, splitListing, splitRecent } from './startPage';
import type { RecentRepo } from '@/shared/api/types';

const entry = (path: string, favorite = false): RecentRepo => ({
  path,
  name: path.split('/').pop() ?? path,
  openedAt: 1,
  exists: true,
  favorite,
});

describe('splitting the recent repositories into sections', () => {
  it('does not repeat a favorite among the recent ones', () => {
    const { favorites, rest } = splitRecent([entry('/a', true), entry('/b')], '');
    expect(favorites.map((e) => e.path)).toEqual(['/a']);
    expect(rest.map((e) => e.path)).toEqual(['/b']);
  });

  it('filters both sections and ignores case', () => {
    const { favorites, rest } = splitRecent(
      [entry('/Alpha', true), entry('/beta'), entry('/Alps')],
      'al',
    );
    expect(favorites.map((e) => e.name)).toEqual(['Alpha']);
    expect(rest.map((e) => e.name)).toEqual(['Alps']);
  });
});

describe('splitting the repositories listed by a host', () => {
  it('moves the favorites into their own section and filters both', () => {
    const repos = [{ fullName: 'me/a' }, { fullName: 'me/b' }, { fullName: 'you/ab' }];
    const { favorites, rest } = splitListing(repos, new Set(['me/a']), 'a');
    expect(favorites.map((r) => r.fullName)).toEqual(['me/a']);
    expect(rest.map((r) => r.fullName)).toEqual(['you/ab']);
  });
});

describe('the kind of host behind the origin hostname', () => {
  it('recognizes the main hosts and their self-hosted instances', () => {
    expect(hostKindOf('github.com')).toBe('github');
    expect(hostKindOf('gitlab.corp.dev')).toBe('gitlab');
    expect(hostKindOf('bitbucket.org')).toBe('bitbucket');
    expect(hostKindOf('git.corp.dev')).toBe('other');
    expect(hostKindOf(null)).toBe(null);
  });
});
