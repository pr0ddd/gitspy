import type { RecentRepo } from '@/types';

export const splitRecent = (
  recent: RecentRepo[],
  filter: string,
): { favorites: RecentRepo[]; rest: RecentRepo[] } => {
  const needle = filter.trim().toLowerCase();
  const shown = needle ? recent.filter((e) => e.name.toLowerCase().includes(needle)) : recent;
  return {
    favorites: shown.filter((e) => e.favorite),
    rest: shown.filter((e) => !e.favorite),
  };
};

export const splitListing = <T extends { fullName: string }>(
  repos: T[],
  starred: ReadonlySet<string>,
  filter: string,
): { favorites: T[]; rest: T[] } => {
  const needle = filter.trim().toLowerCase();
  const shown = needle ? repos.filter((r) => r.fullName.toLowerCase().includes(needle)) : repos;
  return {
    favorites: shown.filter((r) => starred.has(r.fullName)),
    rest: shown.filter((r) => !starred.has(r.fullName)),
  };
};

export type HostKind = 'github' | 'gitlab' | 'bitbucket' | 'other';

export const hostKindOf = (host: string | null | undefined): HostKind | null => {
  if (!host) return null;
  if (host.includes('github')) return 'github';
  if (host.includes('gitlab')) return 'gitlab';
  if (host.includes('bitbucket')) return 'bitbucket';
  return 'other';
};
