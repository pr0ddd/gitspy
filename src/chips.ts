import type { RefKind, RefView } from './types';

export type ChipMark = 'local' | 'remote';

export const remoteAvatarKey = (avatarUrl: string): string => `remote:${avatarUrl}`;

export type Chip = {
  readonly name: string;
  readonly kind: RefKind;
  readonly isHead: boolean;
  readonly marks: readonly ChipMark[];
  readonly remote: string | null;
  readonly refs: readonly RefView[];
};

const marksOf = (kind: RefKind): ChipMark[] => {
  if (kind === 'localBranch') return ['local'];
  if (kind === 'remoteBranch') return ['remote'];
  return [];
};

const remoteOf = (name: string, remotes: readonly string[]): string | null =>
  remotes
    .filter((remote) => name.startsWith(`${remote}/`))
    .reduce<string | null>((longest, remote) => {
      return longest && longest.length >= remote.length ? longest : remote;
    }, null);

export const chipsFor = (labels: readonly RefView[], remotes: readonly string[]): Chip[] => {
  const here = new Set(labels.map((r) => r.name));
  const tracked = (r: RefView) =>
    r.kind === 'localBranch' && r.upstream && here.has(r.upstream) ? r.upstream : null;

  const absorbed = new Set(labels.map(tracked).filter((name): name is string => name !== null));

  return labels
    .filter((r) => !(r.kind === 'remoteBranch' && absorbed.has(r.name)))
    .map((r) => {
      const upstreamName = tracked(r);
      const upstream = upstreamName
        ? labels.find((other) => other.name === upstreamName)
        : undefined;
      const onRemote = upstream ?? (r.kind === 'remoteBranch' ? r : undefined);

      const prefix = r.kind === 'remoteBranch' ? remoteOf(r.name, remotes) : null;

      return {
        name: prefix ? r.name.slice(prefix.length + 1) : r.name,
        kind: r.kind,
        isHead: r.isHead,
        marks: upstream ? (['local', 'remote'] as const) : marksOf(r.kind),
        remote: onRemote ? remoteOf(onRemote.name, remotes) : null,
        refs: upstream ? [r, upstream] : [r],
      };
    });
};
