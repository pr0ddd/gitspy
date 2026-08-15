import { useEffect } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { usePref } from '@/prefs';

export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

const NUDGE = 1e-6;

export const zoomIn = (zoom: number): number =>
  ZOOM_STEPS.find((step) => step > zoom + NUDGE) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];

export const zoomOut = (zoom: number): number =>
  [...ZOOM_STEPS].reverse().find((step) => step < zoom - NUDGE) ?? ZOOM_STEPS[0];

export const zoomLabel = (zoom: number): string => `${Math.round(zoom * 100)}%`;

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

  return { zoom, setZoom };
}
