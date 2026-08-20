import { theme } from '@/shared/ui/theme';
import { canvasDensity } from '@/shared/lib/zoom';
import { readPref } from '@/shared/lib/prefs';
import {
  graphGeometry,
  HEADER_H,
  listWidth,
  rowBandHeight,
  rowBandInset,
  visibleRange,
} from '../scene';
import { drawLaneBands, drawLaneCaps, drawRowHighlights } from './bands';
import {
  chipMetricsFor,
  drawHoveredChip,
  drawRefRows,
  sameChip,
  type HoverChip,
  type HoverReach,
} from './chips';
import { drawDimmedRows } from './dims';
import { drawEdges, drawEdgeShades } from './edges';
import type { Columns, DescriptionMode, Frame, Pass } from './frame';
import { drawHeader } from './header';
import { drawMessages } from './messages';
import { drawMinimap } from './minimap';
import { drawNodes } from './nodes';
import { drawHScroll, drawVScroll } from './scrollbars';

export { chipMetricsFor, sameChip };
export type { Columns, DescriptionMode, Frame, HoverChip, HoverReach };

export function drawFrame(canvas: HTMLCanvasElement, frame: Frame): void {
  const { repo, metrics: m, scrollY, scrollX } = frame;
  const { width, height } = frame;

  const t = theme();
  const descriptionMode = readPref<DescriptionMode>('graph.description', 'always');
  const dpr = canvasDensity();
  const wantW = Math.round(width * dpr);
  const wantH = Math.round(height * dpr);
  if (canvas.width !== wantW || canvas.height !== wantH) {
    canvas.width = wantW;
    canvas.height = wantH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = t.panel;
  ctx.fillRect(0, 0, width, height);

  const listW = listWidth(width, frame.minimap !== null);
  const cols = frame.cols;
  const g = graphGeometry(m, repo?.maxLane ?? 0, scrollX, cols);
  const msgX = cols.message.left + 12;
  const colHash = cols.sha.left + 8;
  const colDate = cols.date.left + 8;
  const colAuthor = cols.author.left + 8;

  if (repo && repo.count > 0) {
    const { first, last, shift } = visibleRange(m, scrollY, height, repo.count, dpr);
    const pass: Pass = {
      ctx,
      frame,
      t,
      m,
      g,
      cols,
      listW,
      height,
      msgX,
      colHash,
      colDate,
      colAuthor,
      first,
      last,
      shift,
      half: m.rowH / 2,
      inset: rowBandInset(m),
      band: rowBandHeight(m),
      descriptionMode,
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, listW, height - HEADER_H);
    ctx.clip();

    drawRowHighlights(pass);

    ctx.save();
    ctx.beginPath();
    ctx.rect(g.gLeft, HEADER_H, g.gRight - g.gLeft, height - HEADER_H);
    ctx.clip();

    drawLaneBands(pass);
    drawEdges(pass);
    drawEdgeShades(pass);
    drawLaneCaps(pass);
    drawNodes(pass);

    ctx.restore();

    drawRefRows(pass);
    drawMessages(pass);
    drawDimmedRows(pass);

    ctx.restore();
    drawHScroll(ctx, frame, g.gLeft, g.gRight);
  }

  drawHeader(ctx, width, cols, msgX, colAuthor, colDate, colHash, frame.columns, m);
  if (frame.minimap === null) drawVScroll(ctx, frame, listW);
  else drawMinimap(ctx, frame, listW);
  drawHoveredChip(ctx, frame);
}
