import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function fetchReadyUpdate(): Promise<string | null> {
  const update = await check();
  if (!update) return null;
  await update.downloadAndInstall();
  return update.version;
}

export const restartToUpdate = (): Promise<void> => relaunch();

const CHECK_EVERY_MS = 60 * 60 * 1000;

export function useReadyUpdate(): string | null {
  const [ready, setReady] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const poll = () =>
      fetchReadyUpdate()
        .then((version) => !stopped && version && setReady(version))
        .catch(() => {});
    void poll();
    const timer = setInterval(poll, CHECK_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  return ready;
}
