import { laneColour, theme } from '@/shared/ui/theme';
import { contentHeight, minimapBand, MINIMAP_TOP, MINIMAP_W } from '../scene';
import type { Frame } from './frame';

export function drawMinimap(ctx: CanvasRenderingContext2D, frame: Frame, listW: number): void {
  const { minimap, repo, scrollY, height, width, metrics } = frame;
  if (!minimap || !repo) return;

  const x0 = listW;
  const top = MINIMAP_TOP;
  const band = minimapBand(height);

  ctx.fillStyle = theme().panel;
  ctx.fillRect(x0, top, width - x0, band);
  ctx.fillStyle = theme().border;
  ctx.fillRect(x0, top, 1, band);

  const inner = MINIMAP_W - 8;
  const laneW = Math.max(1.5, Math.min(4, inner / (minimap.maxLane + 1)));

  for (let b = 0; b < minimap.buckets; b++) {
    const mask = minimap.bits[b];
    if (mask === 0) continue;
    for (let lane = 0; lane <= minimap.maxLane; lane++) {
      if ((mask & (1 << lane)) === 0) continue;
      ctx.fillStyle = laneColour(repo.minimapColours[lane] ?? lane);
      ctx.fillRect(
        x0 + 4 + lane * laneW,
        top + (b * band) / minimap.buckets,
        Math.max(1, laneW - 0.5),
        Math.max(1, band / minimap.buckets),
      );
    }
  }

  const total = repo.count * metrics.rowH;
  const visible = contentHeight(height);
  if (total > visible) {
    const trueH = (visible / total) * band;
    const h = Math.max(24, trueH);
    const centred = top + (scrollY / total) * band - (h - trueH) / 2;
    const at = Math.max(top, Math.min(centred, top + band - h));
    ctx.fillStyle = theme().fill3;
    ctx.fillRect(x0, at, width - x0, h);
    ctx.strokeStyle = theme().faint;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, at + 0.5, width - x0 - 1, h - 1);
  }
}
