import { useEffect, useState } from 'react';
import * as ipc from '@/shared/api/ipc';
import { notifyError } from '@/shared/ui/toast';
import type { AvailableUpdateView } from '@/shared/api/types';

export const RELEASES_URL = 'https://github.com/pr0ddd/gitspy/releases/latest';

const forcedForDevelopment = (): AvailableUpdateView | null => {
  const version = import.meta.env.VITE_UPDATE as string | undefined;
  return version ? { version, installable: true } : null;
};

export function useAvailableUpdate(): AvailableUpdateView | null {
  const [update, setUpdate] = useState<AvailableUpdateView | null>(forcedForDevelopment);

  useEffect(() => {
    if (forcedForDevelopment()) return;
    let stopped = false;
    let heard = false;
    ipc
      .availableUpdate()
      .then((found) => !stopped && !heard && setUpdate(found))
      .catch(() => undefined);
    const stop = ipc.onUpdateAvailable((found) => {
      heard = true;
      if (!stopped) setUpdate(found);
    });
    return () => {
      stopped = true;
      void stop.then((off) => off()).catch(() => undefined);
    };
  }, []);

  return update;
}

export function useUpdateFailures(): void {
  useEffect(() => {
    const stop = ipc.onUpdateFailed(notifyError);
    return () => {
      void stop.then((off) => off()).catch(() => undefined);
    };
  }, []);
}

export async function takeUpdate(update: AvailableUpdateView): Promise<void> {
  try {
    if (update.installable) await ipc.installUpdate();
    else await ipc.openUrl(RELEASES_URL);
  } catch (error) {
    notifyError(error);
  }
}
