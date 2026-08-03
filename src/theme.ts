import type { RefKind } from './types';

export type Theme = {
  graph: string[];
  ref: Record<RefKind, string>;
  foreground: string;
  muted: string;
  faint: string;
  border: string;
  surface: string;
  surfaceRaised: string;
  rowLine: string;
  rowHover: string;
  rowSelected: string;
  added: string;
  modified: string;
  deleted: string;
  conflict: string;
};

const GRAPH_LANES = 12;

let probe: HTMLElement | null = null;
let cached: Theme | null = null;

const resolve = (value: string): string => {
  probe ??= (() => {
    const element = document.createElement('span');
    element.style.display = 'none';
    document.body.appendChild(element);
    return element;
  })();
  probe.style.color = value;
  return getComputedStyle(probe).color;
};

const token = (name: string): string => resolve(`var(${name})`);

const mix = (name: string, percent: number): string =>
  resolve(`color-mix(in oklab, var(${name}) ${percent}%, transparent)`);

const build = (): Theme => ({
  graph: Array.from({ length: GRAPH_LANES }, (_, i) => token(`--graph-${i + 1}`)),
  ref: {
    localBranch: token('--ref-local'),
    remoteBranch: token('--ref-remote'),
    tag: token('--ref-tag'),
    stash: token('--ref-stash'),
  },
  foreground: token('--foreground'),
  muted: token('--muted-foreground'),
  faint: mix('--muted-foreground', 65),
  border: token('--border'),
  surface: token('--surface'),
  surfaceRaised: token('--surface-raised'),
  rowLine: mix('--border', 55),
  rowHover: mix('--surface-hover', 70),
  rowSelected: token('--surface-hover'),
  added: token('--status-added'),
  modified: token('--status-modified'),
  deleted: token('--status-deleted'),
  conflict: token('--status-conflict'),
});

export const theme = (): Theme => (cached ??= build());

export const refreshTheme = (): Theme => (cached = build());

export const laneColour = (index: number): string => {
  const palette = theme().graph;
  return palette[index % palette.length];
};

export const laneColourAlpha = (index: number, percent: number): string =>
  resolve(
    `color-mix(in oklab, var(--graph-${(index % GRAPH_LANES) + 1}) ${percent}%, transparent)`,
  );
