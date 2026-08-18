import { theme } from '@/shared/ui/theme';
import { HEADER_H, type Metrics } from '../scene';
import { dividers, HEADER_ICON_BELOW, type Band, type Cols } from '../columns';
import { GLYPH, strokeGlyphInSlot, type Glyph } from '../glyphs';
import { badgeWidth, chipInset } from '../chipLayout';
import { chipMetricsFor } from './chips';
import type { Columns } from './frame';
import { fitText } from './text';

const HEAD_GLYPH = 12;
const FONT_HEAD = '11px ui-sans-serif, system-ui, sans-serif';
const HEAD_TRACKING = '0.4px';

export function drawHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  cols: Cols,
  msgX: number,
  colAuthor: number,
  colDate: number,
  colHash: number,
  columns: Columns,
  m: Metrics,
): void {
  const gLeft = cols.graph.left;
  const t = theme();
  ctx.fillStyle = t.surfaceRaised;
  ctx.fillRect(0, 0, width, HEADER_H);
  ctx.fillStyle = t.headerLine;
  ctx.fillRect(0, HEADER_H - 1, width, 1);

  ctx.font = FONT_HEAD;
  ctx.letterSpacing = HEAD_TRACKING;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.faint;
  const y = Math.round(HEADER_H / 2);
  ctx.strokeStyle = t.faint;
  const heading = (
    text: string,
    glyph: Glyph,
    column: Band,
    textX: number,
    inset: number,
    glyphX = column.left + (column.width - HEAD_GLYPH) / 2,
  ) => {
    if (column.width <= 0) return;
    const word = text.toUpperCase();
    if (column.width >= HEADER_ICON_BELOW) {
      ctx.fillText(fitText(ctx, word, column.width - inset), textX, y);
    } else {
      strokeGlyphInSlot(ctx, glyph, glyphX, y, HEAD_GLYPH);
    }
  };
  const chipM = chipMetricsFor(m);
  heading(
    columns.branchTag,
    GLYPH.branchTag,
    cols.branchTag,
    12,
    20,
    chipInset(cols.branchTag.width, chipM) + (badgeWidth(chipM) - HEAD_GLYPH) / 2,
  );
  heading(columns.graph, GLYPH.graph, cols.graph, gLeft + 6, 12);
  heading(columns.message, GLYPH.message, cols.message, msgX, 20);
  heading(columns.author, GLYPH.author, cols.author, colAuthor, 12);
  heading(columns.date, GLYPH.date, cols.date, colDate, 12);
  heading(columns.sha, GLYPH.sha, cols.sha, colHash, 12);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = t.border;
  for (const divider of dividers(cols)) {
    ctx.fillRect(Math.round(divider.x), 5, 1, HEADER_H - 10);
  }
}
