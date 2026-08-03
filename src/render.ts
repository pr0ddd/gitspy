import { identicon } from './avatar';
import type { AvatarCache } from './avatarCache';
import {
  contentHeight,
  graphContentWidth,
  graphGeometry,
  HEADER_H,
  HSCROLL_H,
  listWidth,
  maxScroll,
  maxScrollX,
  METRICS_AVATARS,
  METRICS_COMPACT,
  MINIMAP_TOP,
  MINIMAP_W,
  minimapBand,
  pinWidth,
  rowAtY,
  visibleRange,
  type Metrics,
} from './scene';
import { dividers, type Cols } from './columns';

export {
  contentHeight,
  HEADER_H,
  HSCROLL_H,
  listWidth,
  maxScroll,
  maxScrollX,
  METRICS_AVATARS,
  METRICS_COMPACT,
  MINIMAP_W,
  rowAtY,
  type Metrics,
};
import { SEGMENT_KIND, type RefView, type RepoView, type RowView } from './types';
import type { RowCache } from './rows';
import { laneColour, laneColourAlpha, theme } from './theme';
import type { Minimap } from './view';
import { chipsFor, remoteAvatarKey, type Chip } from './chips';
import {
  chipAt,
  moreLabel,
  placeChips,
  type ChipMetrics,
  type PlacedChip,
} from './chipLayout';
import { GLYPH, strokeGlyphInSlot } from './glyphs';

export { chipAt, placeChips };

const CORNER = 7;

const GRAPH_W = 2;

const LEADER_W = 1;
const LEADER_ALPHA = 0.18;
const CAP_W = 2;

const SHADOW_BAND = 14;

const CHIP_PAD = 9;
const MARK_GAP = 4;

const FONT_CHIP = '11px ui-sans-serif, system-ui, sans-serif';
const FONT_HEAD = '10px ui-sans-serif, system-ui, sans-serif';

export type Columns = {
  readonly branchTag: string;
  readonly graph: string;
  readonly message: string;
  readonly author: string;
  readonly date: string;
  readonly sha: string;
  readonly workingTree: string;
  readonly inProgress: string;
};

export type HoverChip = { readonly row: number; readonly at: number | 'more' };

export const chipMetricsFor = (m: Metrics): ChipMetrics => ({
  pad: CHIP_PAD,
  markSize: m.fontPx,
  pullSize: m.fontPx - 2,
  gap: MARK_GAP,
});

export type Frame = {
  readonly repo: RepoView | null;
  readonly rows: RowCache;
  readonly columns: Columns;
  readonly cols: Cols;
  readonly avatars: AvatarCache | null;
  readonly pullHeads: ReadonlySet<string>;
  readonly hoverChip: HoverChip | null;
  readonly refsByCommit: ReadonlyMap<number, RefView[]>;
  readonly minimap: Minimap | null;
  readonly metrics: Metrics;
  readonly scrollY: number;
  readonly scrollX: number;
  readonly hover: number | null;
  readonly selected: number | null;
  readonly width: number;
  readonly height: number;
};

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const avatarKey = (row: RowView, index: number): string =>
  row.kind === 'commit' ? row.email || row.author || String(index) : 'working-tree';

const clipCache = new Map<string, string>();

const isStash = (labels: readonly RefView[] | undefined): boolean =>
  labels?.some((ref) => ref.kind === 'stash') ?? false;

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (max <= 0) return '';
  const key = `${text} ${Math.round(max)} ${ctx.font}`;
  const cached = clipCache.get(key);
  if (cached !== undefined) return cached;

  let out = text;
  if (ctx.measureText(text).width > max) {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(`${text.slice(0, mid)}…`).width <= max) lo = mid;
      else hi = mid - 1;
    }
    out = lo > 0 ? `${text.slice(0, lo)}…` : '';
  }
  if (clipCache.size > 20000) clipCache.clear();
  clipCache.set(key, out);
  return out;
}

export function drawFrame(canvas: HTMLCanvasElement, frame: Frame): void {
  const { repo, rows, refsByCommit, metrics: m, scrollY, scrollX, hover, selected } = frame;
  const { width, height } = frame;

  const t = theme();
  const dpr = window.devicePixelRatio || 1;
  const wantW = Math.round(width * dpr);
  const wantH = Math.round(height * dpr);
  if (canvas.width !== wantW || canvas.height !== wantH) {
    canvas.width = wantW;
    canvas.height = wantH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = t.surface;
  ctx.fillRect(0, 0, width, height);

  const listW = listWidth(width);
  const cols = frame.cols;
  const g = graphGeometry(m, repo?.maxLane ?? 0, scrollX, cols);
  const msgX = cols.message.left + 12;
  const colHash = cols.sha.left + 8;
  const colDate = cols.date.left + 8;
  const colAuthor = cols.author.left + 8;

  if (repo && repo.count > 0) {
    const { first, last, shift } = visibleRange(m, scrollY, height, repo.count, dpr);
    const half = m.rowH / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, listW, height - HEADER_H);
    ctx.clip();

    for (let i = first; i < last; i++) {
      const y = shift + (i - first) * m.rowH;
      if (i === selected || i === hover) {
        ctx.fillStyle = i === selected ? t.rowSelected : t.rowHover;
        const capX = g.nodeX(rows.row(i)?.lane ?? 0);
        ctx.beginPath();
        ctx.arc(capX, y + half, half, Math.PI / 2, -Math.PI / 2);
        ctx.lineTo(listW, y);
        ctx.lineTo(listW, y + m.rowH);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = t.rowLine;
      ctx.fillRect(g.gRight, y + m.rowH - 1, listW - g.gRight, 1);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(g.gLeft, HEADER_H, g.gRight - g.gLeft, height - HEADER_H);
    ctx.clip();

    for (let i = first; i < last; i++) {
      const y = shift + (i - first) * m.rowH;
      const row = rows.row(i);
      if (!row) continue;
      const x = g.nodeX(row.lane) - m.nodeR;
      ctx.fillStyle = laneColourAlpha(row.colour, 11);
      ctx.fillRect(x, y + 1, Math.max(0, g.gRight - x), m.rowH - 2);
    }

    ctx.save();
    ctx.beginPath();
    const clipLeft = g.leftShadow ? g.contentLeft : g.gLeft;
    ctx.rect(clipLeft, HEADER_H, Math.max(0, g.contentRight - clipLeft), height - HEADER_H);
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineWidth = GRAPH_W;

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

    for (const [colour, path] of byColour) {
      ctx.strokeStyle = laneColour(colour);
      ctx.stroke(path);
    }
    ctx.restore();

    if (g.leftShadow) {
      const sh = ctx.createLinearGradient(g.contentLeft, 0, g.contentLeft + SHADOW_BAND, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.55)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(g.contentLeft, HEADER_H, SHADOW_BAND, height - HEADER_H);
    }
    if (g.rightShadow) {
      const sh = ctx.createLinearGradient(g.contentRight, 0, g.contentRight - SHADOW_BAND, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.55)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(g.contentRight - SHADOW_BAND, HEADER_H, SHADOW_BAND, height - HEADER_H);
    }

    for (let i = first; i < last; i++) {
      const row = rows.row(i);
      if (!row) continue;
      const y = shift + (i - first) * m.rowH;
      ctx.fillStyle = laneColour(row.colour);
      ctx.fillRect(g.gRight - CAP_W, y + 1, CAP_W, m.rowH - 2);
    }

    for (let i = first; i < last; i++) {
      const row = rows.row(i);
      if (!row) continue;
      const y = Math.round(shift + (i - first) * m.rowH + half);
      const lane = row.lane;
      const x = g.nodeX(lane);
      const colour = laneColour(row.colour);

      if (g.isStuck(lane)) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 5;
        ctx.fillStyle = t.surface;
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR + 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (row.kind === 'workingTree') {
        ctx.save();
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR - 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.lineWidth = GRAPH_W;
        continue;
      }

      if (isStash(refsByCommit.get(i))) {
        const side = m.nodeR * 1.7;
        ctx.save();
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = colour;
        ctx.fillStyle = laneColourAlpha(row.colour, 22);
        ctx.lineWidth = 2;
        roundRect(ctx, x - side / 2, y - side / 2, side, side, 3);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.lineWidth = GRAPH_W;
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

      if (i === selected) {
        ctx.strokeStyle = t.surface;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, m.nodeR + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = GRAPH_W;
    }

    ctx.restore();

    ctx.textBaseline = 'middle';
    ctx.font = m.font;
    const chipH = m.rowH - 6;
    const chipM = chipMetricsFor(m);
    const remoteNames = repo.remotes.map((r) => r.name);
    const remoteAvatarUrls = new Map(repo.remotes.map((r) => [r.name, r.avatarUrl]));
    const measure = (text: string) => ctx.measureText(text).width;

    const drawRefRow = (labels: readonly RefView[], row: RowView, y: number) => {
      const colour = laneColour(row.colour);
      const nodeX = g.nodeX(row.lane);

      const { placed, more } = placeChips(
        chipsFor(labels, remoteNames),
        measure,
        cols.branchTag.width - 14,
        chipM,
        frame.pullHeads,
      );
      for (const one of placed) {
        drawChip(ctx, one, y, chipH, chipM, t, frame.avatars, remoteAvatarUrls, false);
      }
      if (more) {
        ctx.fillStyle = t.ref[more.chips[0].kind];
        roundRect(ctx, more.x, y - chipH / 2, more.w, chipH, 3);
        ctx.fill();
        ctx.fillStyle = t.foreground;
        ctx.fillText(moreLabel(more.count), more.x + chipM.pad, y);
      }
      const chipEnd = more
        ? more.x + more.w
        : placed.length
          ? placed[placed.length - 1].x + placed[placed.length - 1].w
          : 12;

      ctx.strokeStyle = colour;
      ctx.globalAlpha = Math.min(1, ctx.globalAlpha * LEADER_ALPHA);
      ctx.lineWidth = LEADER_W;
      ctx.beginPath();
      ctx.moveTo(chipEnd, y + 0.5);
      ctx.lineTo(nodeX - m.nodeR, y + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = GRAPH_W;
    };

    for (let i = first; i < last; i++) {
      const labels = refsByCommit.get(i);
      if (!labels) continue;
      const row = rows.row(i);
      if (!row) continue;
      drawRefRow(labels, row, Math.round(shift + (i - first) * m.rowH + half));
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
        let at = colAuthor;
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
      ctx.fillStyle = t.foreground;
      const fitted = fitText(ctx, subject, subjMax);
      ctx.fillText(fitted, msgX, yc);

      const body = row.body;
      if (body && fitted === subject) {
        const used = ctx.measureText(subject).width;
        const rest = subjMax - used - 10;
        if (rest > 20) {
          ctx.fillStyle = t.faint;
          ctx.fillText(fitText(ctx, body.split('\n')[0], rest), msgX + used + 10, yc);
        }
      }

      ctx.fillStyle = t.muted;
      ctx.fillText(fitText(ctx, row.author, colDate - colAuthor - 10), colAuthor, yc);
      ctx.fillText(dateFmt.format(new Date(row.time * 1000)), colDate, yc);
      ctx.font = m.fontMono;
      ctx.fillText(row.hash.slice(0, 7), colHash, yc);
    }

    ctx.restore();
    drawHScroll(ctx, frame, g.gLeft, g.gRight);
  }

  drawHeader(ctx, width, cols, msgX, colAuthor, colDate, colHash, frame.columns);
  drawMinimap(ctx, frame, listW);
  drawHoveredChip(ctx, frame);
}

function drawHoveredChip(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { repo, hoverChip, metrics: m, scrollY, height } = frame;
  if (!repo || !hoverChip) return;

  const dpr = window.devicePixelRatio || 1;
  const { first, last, shift } = visibleRange(m, scrollY, height, repo.count, dpr);
  if (hoverChip.row < first || hoverChip.row >= last) return;

  const labels = frame.refsByCommit.get(hoverChip.row);
  if (!labels) return;

  ctx.font = m.font;
  ctx.textBaseline = 'middle';
  const chipM = chipMetricsFor(m);
  const measure = (text: string) => ctx.measureText(text).width;
  const chips = chipsFor(labels, repo.remotes.map((r) => r.name));
  const { placed } = placeChips(
    chips,
    measure,
    frame.cols.branchTag.width - 14,
    chipM,
    frame.pullHeads,
  );

  const y = Math.round(shift + (hoverChip.row - first) * m.rowH + m.rowH / 2);
  const remoteAvatarUrls = new Map(repo.remotes.map((r) => [r.name, r.avatarUrl]));
  const chipH = m.rowH - 6;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 8;

  if (hoverChip.at === 'more') {
    chips.forEach((chip, i) => {
      drawChip(
        ctx,
        fullPlacement(chip, measure, chipM, frame.pullHeads),
        y + i * (chipH + 4),
        chipH,
        chipM,
        theme(),
        frame.avatars,
        remoteAvatarUrls,
        true,
      );
    });
  } else {
    const one = placed[hoverChip.at];
    if (one) drawChip(ctx, one, y, chipH, chipM, theme(), frame.avatars, remoteAvatarUrls, true);
  }
  ctx.restore();
}

function fullPlacement(
  chip: Chip,
  measure: (text: string) => number,
  chipM: ChipMetrics,
  pullHeads: ReadonlySet<string>,
): PlacedChip {
  const hasPull =
    (chip.kind === 'localBranch' || chip.kind === 'remoteBranch') && pullHeads.has(chip.name);
  const trailW =
    chip.marks.length * (chipM.markSize + chipM.gap) + (hasPull ? chipM.pullSize + chipM.gap : 0);
  const fullText = chip.isHead ? `✓ ${chip.name}` : chip.name;
  const fullW = measure(fullText) + chipM.pad * 2 + trailW;
  return { chip, x: 12, w: fullW, fullW, text: fullText, fullText, hasPull };
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
  expanded: boolean,
): void {
  const { chip } = placed;
  const text = expanded ? placed.fullText : placed.text;
  const w = expanded ? placed.fullW : placed.w;

  ctx.fillStyle = t.ref[chip.kind];
  roundRect(ctx, placed.x, y - chipH / 2, w, chipH, 3);
  ctx.fill();
  if (!text) return;

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = t.foreground;
  ctx.strokeStyle = t.foreground;
  ctx.fillText(text, placed.x + chipM.pad, y);

  let markX = placed.x + chipM.pad + ctx.measureText(text).width + chipM.gap;
  for (const mark of chip.marks) {
    if (mark === 'remote') {
      drawRemoteMark(
        ctx,
        avatars,
        (chip.remote && remoteAvatarUrls.get(chip.remote)) || null,
        markX,
        y,
        chipM.markSize,
      );
    } else {
      strokeGlyphInSlot(ctx, GLYPH.local, markX, y, chipM.markSize);
    }
    markX += chipM.markSize + chipM.gap;
  }
  if (placed.hasPull) strokeGlyphInSlot(ctx, GLYPH.pull, markX, y, chipM.pullSize);
}

function drawHScroll(
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
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(gLeft, y, trackW, HSCROLL_H);

  const content = graphContentWidth(m, repo.maxLane);
  const visible = frame.cols.graph.width - 2 * pinWidth(m);
  const thumbW = Math.max(30, (visible / content) * trackW);
  const thumbX = gLeft + (scrollX / max) * (trackW - thumbW);
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  roundRect(ctx, thumbX, y + 2, thumbW, HSCROLL_H - 4, (HSCROLL_H - 4) / 2);
  ctx.fill();
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  cols: Cols,
  msgX: number,
  colAuthor: number,
  colDate: number,
  colHash: number,
  columns: Columns,
): void {
  const gLeft = cols.graph.left;
  const t = theme();
  ctx.fillStyle = t.surfaceRaised;
  ctx.fillRect(0, 0, width, HEADER_H);
  ctx.fillStyle = t.border;
  ctx.fillRect(0, HEADER_H - 1, width, 1);

  ctx.font = FONT_HEAD;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.muted;
  const y = Math.round(HEADER_H / 2);
  ctx.fillText(fitText(ctx, columns.branchTag, cols.branchTag.width - 20), 12, y);
  ctx.fillText(fitText(ctx, columns.graph, cols.graph.width - 12), gLeft + 6, y);
  ctx.fillText(fitText(ctx, columns.message, cols.message.width - 20), msgX, y);
  ctx.fillText(fitText(ctx, columns.author, cols.author.width - 12), colAuthor, y);
  ctx.fillText(fitText(ctx, columns.date, cols.date.width - 12), colDate, y);
  ctx.fillText(fitText(ctx, columns.sha, cols.sha.width - 12), colHash, y);

  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (const divider of dividers(cols)) {
    ctx.fillRect(Math.round(divider.x), 5, 1, HEADER_H - 10);
  }
}

function drawRemoteMark(
  ctx: CanvasRenderingContext2D,
  avatars: AvatarCache | null,
  avatarUrl: string | null,
  x: number,
  y: number,
  size: number,
): void {
  const look = avatarUrl ? avatars?.lookOf(remoteAvatarKey(avatarUrl)) : undefined;
  if (look?.kind === 'image') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(look.image, x, y - size / 2, size, size);
    ctx.restore();
    return;
  }
  strokeGlyphInSlot(ctx, GLYPH.remote, x, y, size);
}

function drawMinimap(ctx: CanvasRenderingContext2D, frame: Frame, listW: number): void {
  const { minimap, repo, scrollY, height, width, metrics } = frame;
  if (!minimap || !repo) return;

  const x0 = listW;
  const top = MINIMAP_TOP;
  const band = minimapBand(height);

  ctx.fillStyle = theme().surface;
  ctx.fillRect(x0, top, width - x0, band);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
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
    const at = top + (scrollY / total) * band;
    const h = Math.max(6, (visible / total) * band);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x0, at, width - x0, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, at + 0.5, width - x0 - 1, h - 1);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
