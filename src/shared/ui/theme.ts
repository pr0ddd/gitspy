export type Theme = {
  graph: string[];
  foreground: string;
  subject: string;
  muted: string;
  faint: string;
  border: string;
  surfaceRaised: string;
  headerLine: string;
  shade: string;
  panel: string;
  fill1: string;
  fill3: string;
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
  foreground: token('--foreground'),
  subject: token('--subject-foreground'),
  muted: token('--muted-foreground'),
  faint: mix('--muted-foreground', 65),
  border: token('--border'),
  surfaceRaised: token('--surface-raised'),
  headerLine: token('--border'),
  shade: token('--graph-shade'),
  panel: token('--card'),
  fill1: token('--fill-1'),
  fill3: token('--fill-3'),
  rowHover: mix('--surface-hover', 70),
  rowSelected: token('--surface-hover'),
  added: token('--status-added'),
  modified: token('--status-modified'),
  deleted: token('--status-deleted'),
  conflict: token('--status-conflict'),
});

const laneTints = new Map<string, string>();

export const theme = (): Theme => (cached ??= build());

export const refreshTheme = (): Theme => {
  laneTints.clear();
  return (cached = build());
};

export const laneColour = (index: number): string => {
  const palette = theme().graph;
  return palette[index % palette.length];
};

export const laneColourAlpha = (index: number, percent: number): string => {
  const key = `${index % GRAPH_LANES}:${percent}`;
  const known = laneTints.get(key);
  if (known !== undefined) return known;
  const tint = resolve(
    `color-mix(in oklab, var(--graph-${(index % GRAPH_LANES) + 1}) ${percent}%, transparent)`,
  );
  laneTints.set(key, tint);
  return tint;
};

export const laneSoft = (index: number): string => laneColourAlpha(index, 30);
