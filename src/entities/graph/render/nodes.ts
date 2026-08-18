import { identicon } from '@/shared/ui/avatar';
import { laneColour, laneSoft } from '@/shared/ui/theme';
import type { RefView, RowView } from '@/shared/api/types';
import { GLYPH, strokeGlyphInSlot } from '../glyphs';
import type { Pass } from './frame';
import { roundRect } from './shapes';

const avatarKey = (row: RowView, index: number): string =>
  row.kind === 'commit' ? row.email || row.author || String(index) : 'working-tree';

const isStash = (labels: readonly RefView[] | undefined): boolean =>
  labels?.some((ref) => ref.kind === 'stash') ?? false;

export function drawNodes({ ctx, frame, t, m, g, first, last, shift, half }: Pass): void {
  const { rows, refsByCommit } = frame;
  for (let i = first; i < last; i++) {
    const row = rows.row(i);
    if (!row) continue;
    const y = Math.round(shift + (i - first) * m.rowH + half);
    const lane = row.lane;
    const x = g.nodeX(lane);
    const colour = laneColour(row.colour);

    if (g.isStuck(lane) && g.edgeAlpha > 0) {
      ctx.save();
      ctx.shadowColor = t.shade;
      ctx.shadowBlur = 4;
      ctx.fillStyle = t.panel;
      ctx.beginPath();
      ctx.arc(x, y, m.nodeR + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (row.kind === 'workingTree') {
      ctx.save();
      ctx.fillStyle = t.panel;
      ctx.beginPath();
      ctx.arc(x, y, m.nodeR - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      ctx.lineWidth = m.lineW;
      continue;
    }

    if (isStash(refsByCommit.get(i))) {
      const side = m.nodeR * 1.7;
      ctx.save();
      ctx.fillStyle = t.panel;
      roundRect(ctx, x - side / 2, y - side / 2, side, side, 3);
      ctx.fill();
      ctx.fillStyle = laneSoft(row.colour);
      roundRect(ctx, x - side / 2, y - side / 2, side, side, 3);
      ctx.fill();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1;
      roundRect(ctx, x - side / 2, y - side / 2, side, side, 3);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
      strokeGlyphInSlot(ctx, GLYPH.stash, x - side * 0.28, y, side * 0.56);
      ctx.restore();
      ctx.lineWidth = m.lineW;
      continue;
    }

    if (m.avatars) {
      const key = avatarKey(row, i);
      const size = m.nodeR * 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, m.nodeR, 0, Math.PI * 2);
      ctx.clip();
      const look = frame.avatars?.lookOf(row.kind === 'commit' ? row.email : '') ?? {
        kind: 'identicon' as const,
      };
      ctx.drawImage(
        look.kind === 'image' ? look.image : identicon(key, size),
        x - m.nodeR,
        y - m.nodeR,
        size,
        size,
      );
      ctx.restore();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, m.nodeR, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, m.nodeR, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
    }

    ctx.lineWidth = m.lineW;
  }
}
