import { useEffect } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import * as ipc from '@/shared/api/ipc';
import { notifyError, notifyNotARepository } from '@/shared/ui/toast';

export async function openDroppedPaths(
  paths: readonly string[],
  openPath: (path: string) => void,
): Promise<void> {
  const roots = await Promise.all(paths.map((path) => ipc.repositoryRoot(path)));
  const found = [...new Set(roots.filter((root): root is string => root !== null))];
  if (found.length === 0) {
    notifyNotARepository();
    return;
  }
  for (const root of found) openPath(root);
}

export function useDroppedRepositories(openPath: (path: string) => void): void {
  useEffect(() => {
    let stop: (() => void) | null = null;
    let alive = true;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        openDroppedPaths(event.payload.paths, openPath).catch(notifyError);
      })
      .then((unlisten) => {
        if (alive) stop = unlisten;
        else unlisten();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      stop?.();
    };
  }, [openPath]);
}
