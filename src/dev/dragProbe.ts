type Frozen = { graph: boolean; terminal: boolean };

const frozen: Frozen = { graph: false, terminal: false };

export const graphIsFrozen = (): boolean => frozen.graph;

export const terminalIsFrozen = (): boolean => frozen.terminal;

const gaps: number[] = [];

const worst = (kept: number): number[] => [...gaps].sort((a, b) => b - a).slice(0, kept);

const median = (): number => {
  if (gaps.length === 0) return 0;
  const sorted = [...gaps].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const report = (): string =>
  `frames=${gaps.length} median=${median().toFixed(1)}ms worst=${worst(5)
    .map((gap) => gap.toFixed(0))
    .join(',')}ms graphFrozen=${frozen.graph} terminalFrozen=${frozen.terminal}`;

export const startDragProbe = (): void => {
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    gaps.push(now - last);
    if (gaps.length > 600) gaps.shift();
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  window.addEventListener('keydown', (event) => {
    if (!event.altKey) return;
    if (event.code === 'Digit1') frozen.graph = !frozen.graph;
    if (event.code === 'Digit2') frozen.terminal = !frozen.terminal;
    if (event.code === 'Digit3') gaps.length = 0;
    if (event.code === 'Digit4') console.log('DRAG', report());
    if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) {
      event.preventDefault();
      document.title = `DRAG ${report()}`;
    }
  });
};
