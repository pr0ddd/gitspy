import { useEffect } from 'react';
import * as ipc from '@/shared/api/ipc';
import { notifyError } from '@/shared/ui/toast';
import { readPref } from '@/shared/lib/prefs';
import { applyStoredAppearance } from '@/shared/config/appearance';
import { clampAutofetch, SETTINGS } from '@/shared/config/settingsModel';
import type { RecentRepo } from '@/shared/api/types';

export function useStartup(setRecent: (recent: RecentRepo[]) => void): void {
  useEffect(() => {
    applyStoredAppearance();
  }, []);

  useEffect(() => {
    ipc.recentRepos().then(setRecent).catch(notifyError);
    void ipc
      .setAutofetchMinutes(clampAutofetch(readPref(SETTINGS.autofetchMinutes, 1)))
      .catch(() => undefined);
  }, [setRecent]);

  useEffect(() => {
    const suppressWebviewMenu = (e: MouseEvent) => {
      const editable = (e.target as HTMLElement | null)?.closest(
        'input, textarea, [contenteditable]',
      );
      if (!editable) e.preventDefault();
    };
    document.addEventListener('contextmenu', suppressWebviewMenu);
    return () => document.removeEventListener('contextmenu', suppressWebviewMenu);
  }, []);

  useEffect(() => {
    const painted = requestAnimationFrame(() => {
      void ipc.appReady().catch(() => undefined);
    });
    return () => cancelAnimationFrame(painted);
  }, []);
}
