import { theme } from '@/shared/ui/theme';
import {
  graphContentWidth,
  HSCROLL_H,
  maxScrollX,
  pinWidth,
  VSCROLL_W,
  vScrollThumb,
} from '../scene';
import type { Frame } from './frame';
import { roundRect } from './shapes';

export function drawVScroll(ctx: CanvasRenderingContext2D, frame: Frame, listW: number): void {
  const { repo, metrics: m, scrollY, height } = frame;
  if (!repo) return;
  const thumb = vScrollThumb(m, repo.count, scrollY, height);
  if (!thumb) return;
  ctx.fillStyle = theme().fill3;
  roundRect(ctx, listW + 2, thumb.top + 2, VSCROLL_W - 4, thumb.height - 4, (VSCROLL_W - 4) / 2);
  ctx.fill();
}

export function drawHScroll(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  gLeft: number,
  gRight: number,
): void {
  const { repo, metrics: m, scrollX, height } = frame;
  if (!repo) return;
  const max = maxScrollX(m, repo.maxLane, frame.cols.graph.width);
  if (max <= 0) return;

  const trackW = gRight - gLeft;
  const y = height - HSCROLL_H;
  ctx.fillStyle = theme().fill1;
  ctx.fillRect(gLeft, y, trackW, HSCROLL_H);

  const content = graphContentWidth(m, repo.maxLane);
  const visible = frame.cols.graph.width - 2 * pinWidth(m);
  const thumbW = Math.max(30, (visible / content) * trackW);
  const thumbX = gLeft + (scrollX / max) * (trackW - thumbW);
  ctx.fillStyle = theme().fill3;
  roundRect(ctx, thumbX, y + 2, thumbW, HSCROLL_H - 4, (HSCROLL_H - 4) / 2);
  ctx.fill();
}
