import { useEffect, useRef } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { usePref } from './prefs';

export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

const NUDGE = 1e-6;

export const zoomIn = (zoom: number): number =>
  ZOOM_STEPS.find((step) => step > zoom + NUDGE) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];

export const zoomOut = (zoom: number): number =>
  [...ZOOM_STEPS].reverse().find((step) => step < zoom - NUDGE) ?? ZOOM_STEPS[0];

export const zoomLabel = (zoom: number): string => `${Math.round(zoom * 100)}%`;

export const zoomForKey = (key: string, zoom: number): number | null => {
  if (key === '=' || key === '+') return zoomIn(zoom);
  if (key === '-' || key === '_') return zoomOut(zoom);
  if (key === '0') return 1;
  return null;
};

let level = 1;

export const applyZoom = async (zoom: number): Promise<void> => {
  level = zoom;
  await getCurrentWebview().setZoom(zoom);
};

export const canvasDensity = (): number => (window.devicePixelRatio || 1) * level;

export function useZoom(): { zoom: number; setZoom: (zoom: number) => void } {
  const [zoom, setZoom] = usePref<number>('ui.zoom', 1);

  useEffect(() => {
    void applyZoom(zoom).catch(() => {});
  }, [zoom]);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const next = zoomForKey(event.key, zoomRef.current);
      if (next === null) return;
      event.preventDefault();
      setZoom(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setZoom]);

  return { zoom, setZoom };
}
