import type { RefKind, RefView } from './types';

export type ChipMark = 'local' | 'remote';

export type Chip = {
  readonly name: string;
  readonly kind: RefKind;
  readonly isHead: boolean;
  readonly marks: readonly ChipMark[];
  readonly refs: readonly RefView[];
};

const marksOf = (kind: RefKind): ChipMark[] => {
  if (kind === 'localBranch') return ['local'];
  if (kind === 'remoteBranch') return ['remote'];
  return [];
};

export const chipsFor = (labels: readonly RefView[]): Chip[] => {
  const here = new Set(labels.map((r) => r.name));
  const absorbed = new Set(
    labels
      .filter((r) => r.kind === 'localBranch' && r.upstream && here.has(r.upstream))
      .map((r) => r.upstream as string),
  );

  return labels
    .filter((r) => !(r.kind === 'remoteBranch' && absorbed.has(r.name)))
    .map((r) => {
      const upstream =
        r.kind === 'localBranch' && r.upstream && here.has(r.upstream)
          ? labels.find((other) => other.name === r.upstream)
          : undefined;

      return {
        name: r.name,
        kind: r.kind,
        isHead: r.isHead,
        marks: upstream ? ['local' as const, 'remote' as const] : marksOf(r.kind),
        refs: upstream ? [r, upstream] : [r],
      };
    });
};
