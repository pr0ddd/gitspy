import { toast } from 'sonner';

type Frozen = { graph: boolean; terminal: boolean };

const frozen: Frozen = { graph: false, terminal: false };

export const graphIsFrozen = (): boolean => frozen.graph;

export const terminalIsFrozen = (): boolean => frozen.terminal;

const GESTURE_MIN_MS = 250;

let gaps: number[] = [];
let latencies: number[] = [];
let moves = 0;
let pendingMoveAt = 0;
let sampling = false;

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const worst = (values: number[], kept: number): number[] =>
  [...values].sort((a, b) => b - a).slice(0, kept);

const shown = (): string => {
  const frozenNow = [frozen.graph ? 'graph' : null, frozen.terminal ? 'terminal' : null]
    .filter(Boolean)
    .join('+');
  const perSecond = gaps.length > 0 ? (moves / (gaps.length * median(gaps))) * 1000 : 0;
  return `кадры ${gaps.length} медиана ${median(gaps).toFixed(0)} мс · движений ${moves} (${perSecond.toFixed(
    0,
  )}/с) · отклик медиана ${median(latencies).toFixed(0)} мс худший ${worst(latencies, 1)
    .map((one) => one.toFixed(0))
    .join('')} мс${frozenNow ? ` · заморожено: ${frozenNow}` : ''}`;
};

export const startDragProbe = (): void => {
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    if (sampling) {
      gaps.push(now - last);
      if (pendingMoveAt !== 0) {
        latencies.push(now - pendingMoveAt);
        pendingMoveAt = 0;
      }
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  let startedAt = 0;
  window.addEventListener(
    'pointerdown',
    () => {
      gaps = [];
      latencies = [];
      moves = 0;
      pendingMoveAt = 0;
      sampling = true;
      startedAt = performance.now();
    },
    true,
  );

  window.addEventListener(
    'pointermove',
    () => {
      if (!sampling) return;
      moves += 1;
      if (pendingMoveAt === 0) pendingMoveAt = performance.now();
    },
    true,
  );

  window.addEventListener(
    'pointerup',
    () => {
      sampling = false;
      if (performance.now() - startedAt < GESTURE_MIN_MS || gaps.length === 0) return;
      toast.message('Перетаскивание', { description: shown(), duration: 15000 });
    },
    true,
  );

  window.addEventListener(
    'keydown',
    (event) => {
      if (!event.altKey) return;
      if (event.code === 'Digit1') frozen.graph = !frozen.graph;
      else if (event.code === 'Digit2') frozen.terminal = !frozen.terminal;
      else return;
      event.preventDefault();
      event.stopPropagation();
      toast.message('Заморозка', {
        description: `граф: ${frozen.graph ? 'замёрз' : 'живой'} · терминал: ${
          frozen.terminal ? 'замёрз' : 'живой'
        }`,
        duration: 4000,
      });
    },
    true,
  );
};
