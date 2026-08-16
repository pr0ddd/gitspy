import type { RemoteView } from '@/shared/api/types';

export type HostKind = 'github' | 'gitlab' | 'bitbucket';

const MARKERS: ReadonlyArray<readonly [HostKind, string]> = [
  ['github', 'github.com'],
  ['gitlab', 'gitlab.'],
  ['bitbucket', 'bitbucket.'],
];

export const hostOf = (remotes: readonly RemoteView[]): HostKind | null => {
  for (const remote of remotes) {
    const url = remote.webUrl?.toLowerCase() ?? '';
    const found = MARKERS.find(([, marker]) => url.includes(marker));
    if (found) return found[0];
  }
  return null;
};

const BOT_ADDRESSES: ReadonlyArray<readonly [HostKind, string]> = [
  ['github', 'noreply@github.com'],
  ['gitlab', 'noreply@gitlab.com'],
  ['bitbucket', 'commits-noreply@bitbucket.org'],
];

export const hostBotOf = (email: string): HostKind | null => {
  const address = email.toLowerCase();
  const known = BOT_ADDRESSES.find(([, bot]) => address === bot);
  if (known) return known[0];
  if (address.endsWith('@users.noreply.github.com') && address.includes('[bot]')) return 'github';
  return null;
};
