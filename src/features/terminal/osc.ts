const PHASES = ['A', 'B', 'C', 'D'] as const;

export type OscPhase = (typeof PHASES)[number];

export type Osc133 = { phase: OscPhase; exit?: number };

const isPhase = (value: string): value is OscPhase => (PHASES as readonly string[]).includes(value);

const exitCode = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw.trim() === '') return undefined;
  const code = Number(raw);
  return Number.isFinite(code) ? code : undefined;
};

export function parseOsc133(data: string): Osc133 | null {
  const [head, ...rest] = data.split(';');
  const phase = head.trim();
  if (!isPhase(phase)) return null;
  const exit = phase === 'D' ? exitCode(rest[0]) : undefined;
  return exit === undefined ? { phase } : { phase, exit };
}

export function parseOsc7(data: string): string | null {
  try {
    const url = new URL(data);
    if (url.protocol !== 'file:') return null;
    return decodeURIComponent(url.pathname) || null;
  } catch {
    return null;
  }
}
