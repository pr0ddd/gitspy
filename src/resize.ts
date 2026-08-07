export const PANEL_LIMITS = {
  sidebar: { min: 220, max: 400, fallback: 272 },
  details: { min: 280, max: 520, fallback: 320 },
} as const;

export type PanelKind = keyof typeof PANEL_LIMITS;

export function clampPanel(kind: PanelKind, width: number): number {
  const limits = PANEL_LIMITS[kind];
  if (Number.isNaN(width)) return limits.fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(width)));
}
