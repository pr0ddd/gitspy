export type Glyph = {
  readonly d: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
};

export const GLYPH = {
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
