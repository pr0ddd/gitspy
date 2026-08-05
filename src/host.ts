import type { RemoteView } from './types';

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
