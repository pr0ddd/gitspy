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
  panel: string;
  primary: string;
  primarySoft: string;
  fill1: string;
  fill2: string;
  fill3: string;
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
  faint: token('--faint-foreground'),
  border: token('--border'),
  surface: token('--surface'),
  surfaceRaised: token('--surface-raised'),
  panel: token('--card'),
  primary: token('--primary'),
  primarySoft: mix('--primary', 25),
  fill1: token('--fill-1'),
  fill2: token('--fill-2'),
  fill3: token('--fill-3'),
  rowLine: mix('--border', 55),
  rowHover: token('--fill-1'),
  rowSelected: token('--fill-2'),
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

export const laneSoft = (index: number): string => laneColourAlpha(index, 30);
