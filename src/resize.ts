import { useRef, useState } from 'react';
import { usePref } from '@/prefs';

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

export function useShareUnderCursor(
  key: string,
  fallback: number,
  narrowest: number,
  widest: number,
): {
  shown: number;
  begin: () => void;
  moved: (sized: HTMLElement | null, by: number, along: 'x' | 'y') => number;
  commit: () => void;
} {
  const [stored, store] = usePref<number>(key, fallback);
  const clamp = (share: number): number =>
    Number.isFinite(share) ? Math.min(widest, Math.max(narrowest, share)) : fallback;
  const [live, setLive] = useState(clamp(stored));
  const latest = useRef(live);
  latest.current = live;
  const atGestureStart = useRef(live);

  return {
    shown: live,
    begin: () => {
      atGestureStart.current = latest.current;
    },
    moved: (sized, by, along) => {
      const next = clamp(shareAfterDrag(sized, atGestureStart.current, by, along));
      setLive(next);
      return next;
    },
    commit: () => store(latest.current),
  };
}

export function shareAfterDrag(
  sized: HTMLElement | null,
  shareAtStart: number,
  movedBy: number,
  along: 'x' | 'y',
): number {
  const row = sized?.parentElement?.getBoundingClientRect();
  const span = row ? (along === 'x' ? row.width : row.height) : 0;
  if (span <= 0) return shareAtStart;
  return Math.round((shareAtStart - movedBy / span) * span) / span;
}
