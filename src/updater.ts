import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function fetchReadyUpdate(): Promise<string | null> {
  const update = await check();
  if (!update) return null;
  await update.downloadAndInstall();
  return update.version;
}

export const restartToUpdate = (): Promise<void> => relaunch();
