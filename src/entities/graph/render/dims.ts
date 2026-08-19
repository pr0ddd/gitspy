import { veilStrength } from '../veil';
import type { Pass } from './frame';

const VEIL_ALPHA = 0.72;

export function drawDimmedRows({ ctx, frame, t, m, cols, listW, first, last, shift }: Pass): void {
  const veil = frame.veil;
  if (!veil || veil.size === 0) return;
  const left = cols.message.left;
  ctx.save();
  ctx.fillStyle = t.panel;
  for (let i = first; i < last; i++) {
    const level = veil.get(i);
    if (!level) continue;
    ctx.globalAlpha = VEIL_ALPHA * veilStrength(level);
    ctx.fillRect(left, Math.round(shift + (i - first) * m.rowH), listW - left, m.rowH);
  }
  ctx.restore();
}
