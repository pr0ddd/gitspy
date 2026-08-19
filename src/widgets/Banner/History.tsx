import { cn } from '@/shared/lib/utils';

import { Mark } from './Mark';

const WIDTH = 260;
export const HEIGHT = 460;
const MARK = { x: 130, y: 150, size: 112 };

type Props = {
  className?: string;
};

const ROW = 23;
export const ROWS = HEIGHT / ROW;
const SLOT = 20;
const SLOTS = WIDTH / SLOT;
const TRUNKS = [1, 4, 8, 11];
const TONES = [
  'var(--graph-1)',
  'var(--graph-3)',
  'var(--graph-2)',
  'var(--graph-6)',
  'var(--graph-9)',
];

export type Lane = {
  slot: number;
  tone: string;
  from: number;
  to: number;
  forkFrom?: number;
  mergeInto?: number;
  commits: number[];
};

function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

export function history(seed: number): Lane[] {
  const next = rng(seed);
  const busy = Array.from({ length: ROWS + 1 }, () => new Set<number>(TRUNKS));
  const lanes: Lane[] = TRUNKS.map((slot, i) => ({
    slot,
    tone: TONES[i % TONES.length],
    from: 0,
    to: ROWS,
    commits: Array.from({ length: ROWS }, (_, row) => row).filter(() => next() < 0.26),
  }));
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const trunk = TRUNKS[Math.floor(next() * TRUNKS.length)];
    const side = next() < 0.5 ? -1 : 1;
    const slot = trunk + side * (1 + Math.floor(next() * 2));
    const from = 1 + Math.floor(next() * (ROWS - 8));
    const to = from + 4 + Math.floor(next() * 4);
    if (slot < 0 || slot >= SLOTS || to >= ROWS - 1) continue;
    let free = true;
    for (let row = from; row <= to; row += 1) if (busy[row].has(slot)) free = false;
    if (!free) continue;
    for (let row = from; row <= to; row += 1) busy[row].add(slot);
    const commits = [];
    for (let row = from + 2; row < to; row += 2) if (next() < 0.8) commits.push(row);
    lanes.push({
      slot,
      tone: TONES[Math.floor(next() * TONES.length)],
      from,
      to,
      forkFrom: trunk,
      mergeInto: trunk,
      commits,
    });
  }
  return lanes;
}

const LANES = history(11);

const solid = (tint: string, share: number) =>
  `color-mix(in oklch, var(--background), ${tint} ${share}%)`;

const x = (slot: number) => slot * SLOT + SLOT / 2;
const y = (row: number) => row * ROW + ROW / 2;

function bend(x1: number, y1: number, x2: number, y2: number) {
  const mid = (y1 + y2) / 2;
  return `C ${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
}

export function lanePath(lane: Lane): string {
  const lx = x(lane.slot);
  const parts: string[] = [];
  if (lane.forkFrom === undefined) {
    parts.push(`M ${lx} 0`);
  } else {
    parts.push(
      `M ${x(lane.forkFrom)} ${y(lane.from)}`,
      bend(x(lane.forkFrom), y(lane.from), lx, y(lane.from + 1)),
    );
  }
  if (lane.mergeInto === undefined) {
    parts.push(`L ${lx} ${HEIGHT}`);
  } else {
    parts.push(
      `L ${lx} ${y(lane.to - 1)}`,
      bend(lx, y(lane.to - 1), x(lane.mergeInto), y(lane.to)),
    );
  }
  return parts.join(' ');
}

function Flow({ offset }: { offset: number }) {
  return (
    <g transform={`translate(0 ${offset})`}>
      {LANES.map((lane, i) => (
        <g key={i} stroke={lane.tone} fill={lane.tone}>
          <path d={lanePath(lane)} fill="none" strokeWidth="1.5" strokeOpacity="0.4" />
          {lane.commits.map((row) => (
            <circle
              key={row}
              cx={x(lane.slot)}
              cy={y(row)}
              r="2.5"
              fill={solid(lane.tone, 75)}
              stroke="none"
            />
          ))}
        </g>
      ))}
    </g>
  );
}

const FADE_TOP = 0.28;
const FADE_BOTTOM = 0.48;
const HOLE = 92;

export function History({ className }: Props) {
  return (
    <div className={cn('overflow-hidden', className)} aria-hidden>
      <div
        className="motion-reduce:animate-none animate-flow absolute inset-x-0 top-0 will-change-transform"
        style={{ height: HEIGHT * 2 }}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT * 2}`} width={WIDTH} height={HEIGHT * 2}>
          <Flow offset={0} />
          <Flow offset={HEIGHT} />
        </svg>
      </div>
      <div
        className="absolute inset-x-0 top-0 bg-linear-to-b from-background from-14% to-transparent"
        style={{ height: HEIGHT * FADE_TOP }}
      />
      <div
        className="absolute inset-x-0 bottom-0 bg-linear-to-t from-background from-54% to-transparent"
        style={{ height: HEIGHT * (1 - FADE_BOTTOM) }}
      />
      <div
        className="absolute rounded-full bg-radial from-background from-55% to-transparent"
        style={{ left: MARK.x - HOLE, top: MARK.y - HOLE, width: HOLE * 2, height: HOLE * 2 }}
      />
      <Mark x={MARK.x - MARK.size / 2} y={MARK.y - MARK.size / 2} size={MARK.size} />
    </div>
  );
}
