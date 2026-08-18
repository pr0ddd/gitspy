import { rowBandHeight, rowBandInset } from '../scene';
import { GLYPH, strokeGlyphInSlot } from '../glyphs';
import { wipBadgesX, wipContent } from '../wip';
import type { Pass } from './frame';
import { dateFmt, fitText } from './text';

const FONT_CHIP = '11px ui-sans-serif, system-ui, sans-serif';

export function drawMessages({
  ctx,
  frame,
  t,
  m,
  cols,
  listW,
  msgX,
  colHash,
  colDate,
  colAuthor,
  first,
  last,
  shift,
  half,
  descriptionMode,
}: Pass): void {
  const { rows, hover } = frame;
  ctx.textBaseline = 'middle';
  for (let i = first; i < last; i++) {
    const yc = Math.round(shift + (i - first) * m.rowH + half);
    ctx.font = m.font;

    const row = rows.row(i);
    if (!row) {
      ctx.fillStyle = t.faint;
      ctx.fillText('—', msgX, yc);
      continue;
    }

    if (row.kind === 'workingTree') {
      ctx.font = FONT_CHIP;

      const badge = Math.max(9, m.fontPx - 3);
      if (wipContent(row) === 'conflictBanner') {
        const bandX = cols.message.left;
        const bandW = listW - bandX;
        const bandTop = yc - half + rowBandInset(m);
        ctx.save();
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = t.conflict;
        ctx.fillRect(bandX, bandTop, bandW, rowBandHeight(m));
        ctx.restore();
        ctx.strokeStyle = t.foreground;
        strokeGlyphInSlot(ctx, GLYPH.conflict, msgX + 2, yc, badge);
        ctx.fillStyle = t.foreground;
        ctx.fillText(
          fitText(ctx, frame.columns.mergeConflicts, bandW - badge - 28),
          msgX + badge + 10,
          yc,
        );
        continue;
      }
      let at = wipBadgesX(cols);
      for (const [count, tint, glyph] of [
        [row.modified, t.modified, GLYPH.modified],
        [row.added, t.added, GLYPH.added],
        [row.deleted, t.deleted, GLYPH.deleted],
        [row.conflicts, t.conflict, GLYPH.conflict],
      ] as const) {
        if (count === 0) continue;
        ctx.fillStyle = tint;
        ctx.strokeStyle = tint;
        strokeGlyphInSlot(ctx, glyph, at, yc, badge);
        const shown = String(count);
        ctx.fillText(shown, at + badge + 3, yc);
        at += badge + 3 + ctx.measureText(shown).width + 10;
      }

      if (row.inProgress) {
        ctx.fillStyle = t.conflict;
        ctx.fillText(frame.columns.inProgress, at, yc);
      }
      continue;
    }

    const subject = row.subject;

    const subjMax = colAuthor - msgX - 12;
    ctx.font = m.font;
    ctx.fillStyle = t.subject;
    const fitted = fitText(ctx, subject, subjMax);
    ctx.fillText(fitted, msgX, yc);

    const body = row.body;
    const wanted = descriptionMode === 'always' || (descriptionMode === 'hover' && i === hover);
    if (wanted && body && fitted === subject) {
      const used = ctx.measureText(subject).width;
      const rest = subjMax - used - 10;
      if (rest > 20) {
        ctx.fillStyle = t.faint;
        ctx.fillText(fitText(ctx, body.split('\n')[0], rest), msgX + used + 10, yc);
      }
    }

    ctx.fillStyle = t.muted;
    ctx.font = m.fontDetail;
    if (cols.author.width > 0) {
      ctx.fillText(fitText(ctx, row.author, cols.author.width - 12), colAuthor, yc);
    }
    if (cols.date.width > 0) {
      const date = dateFmt.format(new Date(row.time * 1000));
      ctx.fillText(fitText(ctx, date, cols.date.width - 12), colDate, yc);
    }
    if (cols.sha.width > 0) {
      ctx.font = m.fontMono;
      ctx.fillText(fitText(ctx, row.hash.slice(0, 7), cols.sha.width - 12), colHash, yc);
    }
  }
}
