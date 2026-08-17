import type { RemoteView } from '@/shared/api/types';
import type { IconName } from '@/shared/ui/icons';

export type HostKind = 'github' | 'gitlab' | 'bitbucket';

export const HOST_LABEL: Readonly<Record<HostKind, string>> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

export const HOSTS: ReadonlyArray<{ id: HostKind; label: string; icon: IconName }> = [
  { id: 'github', label: HOST_LABEL.github, icon: 'github' },
  { id: 'gitlab', label: HOST_LABEL.gitlab, icon: 'gitlab' },
  { id: 'bitbucket', label: HOST_LABEL.bitbucket, icon: 'bitbucket' },
];

const MARKERS: ReadonlyArray<readonly [HostKind, string]> = [
  ['github', 'github.com'],
  ['gitlab', 'gitlab.'],
  ['bitbucket', 'bitbucket.'],
];

export const hostOfUrl = (url: string): HostKind | null => {
  const lowered = url.toLowerCase();
  return MARKERS.find(([, marker]) => lowered.includes(marker))?.[0] ?? null;
};

export const hostOf = (remotes: readonly RemoteView[]): HostKind | null => {
  for (const remote of remotes) {
    const found = hostOfUrl(remote.webUrl ?? '');
    if (found) return found;
  }
  return null;
};

export const hostLabelOf = (kind: string): string =>
  kind in HOST_LABEL ? HOST_LABEL[kind as HostKind] : kind;

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
