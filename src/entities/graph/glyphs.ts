export type Glyph = {
  readonly d: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
};

export const GLYPH = {
  stash: {
    d: 'M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8 M10 12h4',
    x0: 3,
    y0: 3,
    x1: 21,
    y1: 21,
  },
  local: {
    d: 'M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z M20.054 15.987H3.946',
    x0: 2.6,
    y0: 5,
    x1: 21.4,
    y1: 20,
  },
  remote: {
    d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
    x0: 2,
    y0: 5,
    x1: 22,
    y1: 19,
  },
  pull: {
    d: 'M21 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M9 6a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M13 6h3a2 2 0 0 1 2 2v7 M6 9V21',
    x0: 3,
    y0: 3,
    x1: 21,
    y1: 21,
  },
  tag: {
    d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z M7.5 7.5h.01',
    x0: 0.4,
    y0: 0.4,
    x1: 23.6,
    y1: 23.6,
  },
  modified: {
    d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z M15 5l4 4',
    x0: 2,
    y0: 2.5,
    x1: 21.5,
    y1: 22,
  },
  added: {
    d: 'M5 12h14 M12 5v14',
    x0: 5,
    y0: 5,
    x1: 19,
    y1: 19,
  },
  deleted: {
    d: 'M5 12h14',
    x0: 5,
    y0: 5,
    x1: 19,
    y1: 19,
  },
  graph: {
    d: 'M8 6a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M5 9v6 M8 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M12 3v18 M22 6a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M16 15.7A9 9 0 0 0 19 9',
    x0: 2,
    y0: 3,
    x1: 22,
    y1: 21,
  },
  branchTag: {
    d: 'M15 6a9 9 0 0 0-9 9V3 M21 6a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
    x0: 3,
    y0: 3,
    x1: 21,
    y1: 21,
  },
  message: {
    d: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
    x0: 2,
    y0: 3,
    x1: 22,
    y1: 21.5,
  },
  author: {
    d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0',
    x0: 5,
    y0: 3,
    x1: 19,
    y1: 21,
  },
  date: {
    d: 'M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0 M12 6v6l4 2',
    x0: 2,
    y0: 2,
    x1: 22,
    y1: 22,
  },
  sha: {
    d: 'M4 9h16 M4 15h16 M10 3l-2 18 M16 3l-2 18',
    x0: 4,
    y0: 3,
    x1: 20,
    y1: 21,
  },
  conflict: {
    d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3 M12 9v4 M12 17h.01',
    x0: 2,
    y0: 2.5,
    x1: 22,
    y1: 21,
  },
} as const satisfies Record<string, Glyph>;

export function strokeGlyphInSlot(
  ctx: CanvasRenderingContext2D,
  glyph: Glyph,
  slotX: number,
  yCenter: number,
  slot: number,
): void {
  const inkW = glyph.x1 - glyph.x0;
  const inkH = glyph.y1 - glyph.y0;
  const scale = slot / Math.max(inkW, inkH);

  ctx.save();
  ctx.translate(
    slotX + (slot - inkW * scale) / 2 - glyph.x0 * scale,
    yCenter - ((glyph.y0 + glyph.y1) / 2) * scale,
  );
  ctx.scale(scale, scale);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(glyph.d));
  ctx.restore();
}
