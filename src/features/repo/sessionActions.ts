import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';
import { readPref, writePref } from '@/prefs';
import { SETTINGS } from '@/settingsModel';
import type { Session, SessionsAction } from '@/entities/repo';
import type { RecentRepo } from '@/types';

type Wiring = {
  sessions: Session[];
  active: string | null;
  dispatch: (action: SessionsAction) => void;
  load: (path: string) => Promise<void>;
  drop: (path: string) => void;
  setRecent: (recent: RecentRepo[]) => void;
};

export function useSessionActions({ sessions, active, dispatch, load, drop, setRecent }: Wiring) {
  const { t } = useTranslation();

  const openPath = useCallback(
    (path: string) => {
      dispatch({ kind: 'open', path });
      void load(path);
    },
    [dispatch, load],
  );

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (!readPref<boolean>(SETTINGS.rememberTabs, true)) return;
    const stored = readPref<string[]>('session.open', []);
    stored.forEach((path) => openPath(path));
    const lastActive = readPref<string | null>('session.active', null);
    if (lastActive && stored.includes(lastActive)) {
      dispatch({ kind: 'activate', path: lastActive });
    }
  }, [openPath, dispatch]);

  useEffect(() => {
    if (!restoredRef.current) return;
    if (!readPref<boolean>(SETTINGS.rememberTabs, true)) {
      writePref('session.open', []);
      writePref('session.active', null);
      return;
    }
    writePref(
      'session.open',
      sessions.map((s) => s.path),
    );
    writePref('session.active', active);
  }, [sessions, active]);

  const pickRepo = useCallback(async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: t('repo.pickTitle'),
    });
    if (typeof picked === 'string') openPath(picked);
  }, [t, openPath]);

  const closeRepo = useCallback(
    (path: string) => {
      void ipc.closeRepo(path);
      drop(path);
      dispatch({ kind: 'close', path });
    },
    [drop, dispatch],
  );

  const forget = useCallback(
    (path: string) => {
      ipc.forgetRepo(path).then(setRecent).catch(notifyError);
    },
    [setRecent],
  );

  return { openPath, pickRepo, closeRepo, forget };
}
