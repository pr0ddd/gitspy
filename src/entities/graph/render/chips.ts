import type { AvatarCache } from '@/shared/ui/avatarCache';
import type { RefView, RowView } from '@/shared/api/types';
import { laneColour, laneColourAlpha, theme } from '@/shared/ui/theme';
import { canvasDensity } from '@/shared/lib/zoom';
import { graphGeometry, visibleRange, type Metrics } from '../scene';
import { chipsFor, remoteAvatarKey } from '../chips';
import {
  chipInset,
  markWidth,
  MORE_PAD,
  moreLabel,
  placeChips,
  stackChips,
  stackWidth,
  type ChipMetrics,
  type PlacedChip,
} from '../chipLayout';
import { GLYPH, strokeGlyphInSlot } from '../glyphs';
import type { Frame, Pass } from './frame';
import { roundRect } from './shapes';

const LEADER_W = 1;
const LEADER_ALPHA = 0.18;
const STACK_PAD = 0;
const STACK_GAP = 0;
const STACK_TINT = 18;
const CHIP_TINT = 28;
const CHIP_TINT_HEAD = 45;
const CHIP_PAD = 9;
const MARK_GAP = 4;

export type HoverReach = 'branch' | 'commit';

export type HoverChip = {
  readonly row: number;
  readonly at: number | 'more';
  readonly reach: HoverReach;
};

export const sameChip = (a: HoverChip | null, b: HoverChip | null): boolean =>
  a === b || (a !== null && b !== null && a.row === b.row && a.at === b.at);

export const chipMetricsFor = (m: Metrics): ChipMetrics => ({
  pad: CHIP_PAD,
  markSize: m.fontPx,
  avatarSize: m.fontPx + 4,
  pullSize: m.fontPx - 2,
  gap: MARK_GAP,
});

export function drawRefRows({ ctx, frame, t, m, g, cols, first, last, shift, half }: Pass): void {
  const { repo, rows, refsByCommit, hover, hoverChip } = frame;
  if (!repo) return;
  ctx.textBaseline = 'middle';
  ctx.font = m.font;
  const chipH = m.rowH - 6;
  const chipM = chipMetricsFor(m);
  const remoteNames = repo.remotes.map((r) => r.name);
  const remoteAvatarUrls = new Map(repo.remotes.map((r) => [r.name, r.avatarUrl]));
  const measure = (text: string) => ctx.measureText(text).width;

  const drawRefRow = (labels: readonly RefView[], row: RowView, y: number, unfolded = false) => {
    const colour = laneColour(row.colour);
    const nodeX = g.nodeX(row.lane);

    const { placed, more } = placeChips(
      chipsFor(labels, remoteNames),
      measure,
      cols.branchTag.width,
      chipM,
      frame.pullHeads,
    );
    if (!placed.length && !more) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y - chipH, cols.branchTag.width, chipH * 2);
    ctx.clip();
    for (const one of placed) {
      drawChip(ctx, one, y, chipH, chipM, t, frame.avatars, remoteAvatarUrls, row.colour, false);
    }
    if (more && !unfolded) {
      ctx.fillStyle = laneColourAlpha(row.colour, CHIP_TINT);
      roundRect(ctx, more.x, y - chipH / 2, more.w, chipH, 6);
      ctx.fill();
      ctx.fillStyle = t.subject;
      ctx.fillText(moreLabel(more.count), more.x + MORE_PAD, y);
    }
    ctx.restore();
    if (unfolded) return;
    const chipEnd = more
      ? more.x + more.w
      : placed.length
        ? placed[placed.length - 1].x + placed[placed.length - 1].w
        : 12;

    ctx.strokeStyle = colour;
    ctx.globalAlpha = Math.min(1, ctx.globalAlpha * LEADER_ALPHA);
    ctx.lineWidth = LEADER_W;
    ctx.beginPath();
    ctx.moveTo(Math.min(chipEnd, cols.branchTag.width), y + 0.5);
    ctx.lineTo(nodeX - m.nodeR, y + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = m.lineW;
  };

  for (let i = first; i < last; i++) {
    if (cols.branchTag.width === 0) break;
    const labels = refsByCommit.get(i);
    if (!labels) continue;
    const row = rows.row(i);
    if (!row) continue;
    drawRefRow(labels, row, Math.round(shift + (i - first) * m.rowH + half), hoverChip?.row === i);
  }

  if (hover !== null && hover >= first && hover < last && !refsByCommit.has(hover)) {
    const hovered = rows.row(hover);
    if (hovered && hovered.kind === 'commit') {
      let donor = -1;
      for (const [tipRow] of refsByCommit) {
        if (tipRow > hover || tipRow <= donor) continue;
        const tip = rows.row(tipRow);
        if (tip && tip.colour === hovered.colour) donor = tipRow;
      }
      const labels = donor === -1 ? undefined : refsByCommit.get(donor);
      if (labels) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        drawRefRow(labels, hovered, Math.round(shift + (hover - first) * m.rowH + half));
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }
}

export function drawHoveredChip(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { repo, rows, hoverChip, metrics: m, scrollY, height } = frame;
  if (!repo || !hoverChip) return;

  const dpr = canvasDensity();
  const { first, last, shift } = visibleRange(m, scrollY, height, repo.count, dpr);
  if (hoverChip.row < first || hoverChip.row >= last) return;

  if (frame.cols.branchTag.width === 0) return;
  const labels = frame.refsByCommit.get(hoverChip.row);
  if (!labels) return;

  ctx.font = m.font;
  ctx.textBaseline = 'middle';
  const chipM = chipMetricsFor(m);
  const measure = (text: string) => ctx.measureText(text).width;
  const chips = chipsFor(
    labels,
    repo.remotes.map((r) => r.name),
  );

  const y = Math.round(shift + (hoverChip.row - first) * m.rowH + m.rowH / 2);
  const remoteAvatarUrls = new Map(repo.remotes.map((r) => [r.name, r.avatarUrl]));
  const chipH = m.rowH - 6;
  const lane = rows.row(hoverChip.row)?.colour ?? 0;

  ctx.save();
  ctx.shadowColor = theme().shade;
  ctx.shadowBlur = 8;

  const inset = chipInset(frame.cols.branchTag.width, chipM);
  const stack = stackChips(chips, measure, chipM, frame.pullHeads, inset);
  const panelW = stackWidth(stack) + STACK_PAD * 2;
  const panelH = stack.length * chipH + (stack.length - 1) * STACK_GAP + STACK_PAD * 2;
  const panelLeft = inset - STACK_PAD;
  const t = theme();
  ctx.fillStyle = t.panel;
  roundRect(ctx, panelLeft, y - chipH / 2 - STACK_PAD, panelW, panelH, 6);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = laneColourAlpha(lane, STACK_TINT);
  roundRect(ctx, panelLeft, y - chipH / 2 - STACK_PAD, panelW, panelH, 6);
  ctx.fill();
  stack.forEach((row, i) => {
    drawChip(
      ctx,
      row,
      y + i * (chipH + STACK_GAP),
      chipH,
      chipM,
      t,
      frame.avatars,
      remoteAvatarUrls,
      lane,
      true,
      i > 0,
    );
  });
  const g = graphGeometry(m, repo.maxLane, frame.scrollX, frame.cols);
  const nodeX = g.nodeX(rows.row(hoverChip.row)?.lane ?? 0);
  ctx.strokeStyle = laneColour(lane);
  ctx.globalAlpha = LEADER_ALPHA;
  ctx.lineWidth = LEADER_W;
  ctx.beginPath();
  ctx.moveTo(panelLeft + panelW, y + 0.5);
  ctx.lineTo(nodeX - m.nodeR, y + 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  placed: PlacedChip,
  y: number,
  chipH: number,
  chipM: ChipMetrics,
  t: ReturnType<typeof theme>,
  avatars: AvatarCache | null,
  remoteAvatarUrls: ReadonlyMap<string, string | null>,
  lane: number,
  expanded: boolean,
  flat = false,
): void {
  const { chip } = placed;
  const text = placed.text;
  const w = placed.w;

  if (expanded && !flat) {
    ctx.fillStyle = t.panel;
    roundRect(ctx, placed.x, y - chipH / 2, w, chipH, 6);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  if (!flat) {
    ctx.fillStyle = laneColourAlpha(lane, chip.isHead ? CHIP_TINT_HEAD : CHIP_TINT);
    roundRect(ctx, placed.x, y - chipH / 2, w, chipH, 6);
    ctx.fill();
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = t.subject;
  ctx.strokeStyle = t.subject;
  if (text) ctx.fillText(text, placed.textX, y);

  drawMarks(ctx, placed, y, chipM, avatars, remoteAvatarUrls);
}

function drawMarks(
  ctx: CanvasRenderingContext2D,
  placed: PlacedChip,
  y: number,
  chipM: ChipMetrics,
  avatars: AvatarCache | null,
  remoteAvatarUrls: ReadonlyMap<string, string | null>,
): void {
  const { chip, hasPull } = placed;
  let markX = placed.marksX;
  for (const mark of placed.marks) {
    if (mark === 'remote') {
      drawRemoteMark(
        ctx,
        avatars,
        (chip.remote && remoteAvatarUrls.get(chip.remote)) || null,
        markX,
        y,
        chipM,
      );
    } else {
      strokeGlyphInSlot(
        ctx,
        mark === 'tag' ? GLYPH.tag : GLYPH.local,
        markX + (chipM.avatarSize - chipM.markSize) / 2,
        y,
        chipM.markSize,
      );
    }
    markX += markWidth(mark, chipM) + chipM.gap;
  }
  if (hasPull) strokeGlyphInSlot(ctx, GLYPH.pull, markX, y, chipM.pullSize);
}

function drawRemoteMark(
  ctx: CanvasRenderingContext2D,
  avatars: AvatarCache | null,
  avatarUrl: string | null,
  x: number,
  y: number,
  chipM: ChipMetrics,
): void {
  const look = avatarUrl ? avatars?.lookOf(remoteAvatarKey(avatarUrl)) : undefined;
  const size = chipM.avatarSize;
  if (look?.kind === 'image') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(look.image, x, y - size / 2, size, size);
    ctx.restore();
    return;
  }
  strokeGlyphInSlot(ctx, GLYPH.remote, x + (size - chipM.markSize) / 2, y, chipM.markSize);
}
