import { SEGMENT_KIND } from '@/shared/api/types';
import { laneColour } from '@/shared/ui/theme';
import { HEADER_H } from '../scene';
import type { Pass } from './frame';

const CORNER = 7;
const SHADOW_BAND = 14;

export function drawEdges({ ctx, frame, m, g, height, first, last, shift, half }: Pass): void {
  const { rows } = frame;
  ctx.save();
  ctx.beginPath();
  const clipLeft = g.leftShade > 0 ? g.contentLeft : g.gLeft;
  ctx.rect(clipLeft, HEADER_H, Math.max(0, g.contentRight - clipLeft), height - HEADER_H);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineWidth = m.lineW;
  ctx.globalAlpha = g.edgeAlpha;

  const byColour = new Map<number, Path2D>();
  for (let i = first; i < last; i++) {
    const y = shift + (i - first) * m.rowH + half;
    const found = rows.segments(i);
    if (!found) continue;
    const w = found.window;
    for (let s = found.from; s < found.to; s++) {
      const kind = w.segKind[s];
      const a = Math.min(g.laneAt(w.segFrom[s]), g.pinX);
      const b = Math.min(g.laneAt(w.segTo[s]), g.pinX);
      if (Math.max(a, b) < g.contentLeft - 40) continue;

      const colour = w.segColour[s];
      let path = byColour.get(colour);
      if (!path) {
        path = new Path2D();
        byColour.set(colour, path);
      }
      if (kind === SEGMENT_KIND.through) {
        path.moveTo(a, y - half);
        path.lineTo(a, y + half);
      } else if (kind === SEGMENT_KIND.stemUp) {
        path.moveTo(a, y - half);
        path.lineTo(a, y);
      } else if (kind === SEGMENT_KIND.stemDown) {
        path.moveTo(a, y);
        path.lineTo(a, y + half);
      } else if (kind === SEGMENT_KIND.merge) {
        path.moveTo(a, y - half);
        path.arcTo(a, y, b, y, CORNER);
        path.lineTo(b, y);
      } else {
        path.moveTo(a, y);
        path.arcTo(b, y, b, y + half, CORNER);
        path.lineTo(b, y + half);
      }
    }
  }

  if (g.edgeAlpha > 0) {
    for (const [colour, path] of byColour) {
      ctx.strokeStyle = laneColour(colour);
      ctx.stroke(path);
    }
  }
  ctx.restore();
}

export function drawEdgeShades({ ctx, t, g, height }: Pass): void {
  if (g.leftShade > 0) {
    const sh = ctx.createLinearGradient(g.contentLeft, 0, g.contentLeft + SHADOW_BAND, 0);
    sh.addColorStop(0, t.shade);
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = g.leftShade;
    ctx.fillStyle = sh;
    ctx.fillRect(g.contentLeft, HEADER_H, SHADOW_BAND, height - HEADER_H);
    ctx.restore();
  }
  if (g.rightShade > 0) {
    const sh = ctx.createLinearGradient(g.contentRight, 0, g.contentRight - SHADOW_BAND, 0);
    sh.addColorStop(0, t.shade);
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = g.rightShade;
    ctx.fillStyle = sh;
    ctx.fillRect(g.contentRight - SHADOW_BAND, HEADER_H, SHADOW_BAND, height - HEADER_H);
    ctx.restore();
  }
}
