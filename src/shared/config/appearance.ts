import { useEffect } from 'react';

import { readPref, usePref } from '@/shared/lib/prefs';
import { refreshTheme } from '@/shared/ui/theme';

export const APPEARANCE_PREF = 'ui.appearance';

export const APPEARANCES = [
  { key: '', label: 'appearance.gitspy' },
  { key: 'linear-dark', label: 'appearance.gitspyDark' },
  { key: 'classic-dark', label: 'appearance.classicDark' },
  { key: 'magic-blue', label: 'appearance.magicBlue' },
  { key: 'linear-light', label: 'appearance.gitspyLight' },
  { key: 'pure-light', label: 'appearance.pureLight' },
] as const;

export type AppearanceKey = (typeof APPEARANCES)[number]['key'];

export function knownAppearance(raw: string): AppearanceKey {
  return APPEARANCES.some((entry) => entry.key === raw) ? (raw as AppearanceKey) : '';
}

export function applyAppearance(key: AppearanceKey): void {
  if (key) {
    document.documentElement.dataset.theme = key;
  } else {
    delete document.documentElement.dataset.theme;
  }
  refreshTheme();
}

export function useAppearance() {
  const [stored, setStored] = usePref<string>(APPEARANCE_PREF, '');
  const appearance = knownAppearance(stored);

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  return [appearance, setStored] as const;
}

export function applyStoredAppearance(): void {
  applyAppearance(knownAppearance(readPref<string>(APPEARANCE_PREF, '')));
}
