import { useCallback, useRef, useState } from 'react';
import { CHUNK, RowCache } from '@/entities/graph';
import * as ipc from '@/shared/api/ipc';
import { notifyError } from '@/shared/ui/toast';

export type RepoData = {
  readonly cacheFor: (path: string) => RowCache;
  readonly refill: (path: string) => Promise<void>;
  readonly refillFirstWindow: (path: string) => Promise<void>;
  readonly fetchChunks: (path: string, chunks: number[]) => void;
  readonly drop: (path: string) => void;
  readonly version: number;
};

export function useRepoData(): RepoData {
  const caches = useRef(new Map<string, RowCache>());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((n) => n + 1), []);

  const cacheFor = useCallback((path: string) => {
    let cache = caches.current.get(path);
    if (!cache) {
      cache = new RowCache();
      caches.current.set(path, cache);
    }
    return cache;
  }, []);

  const refill = useCallback(
    async (path: string) => {
      const fresh = await ipc.graphWindow(path, 0, CHUNK);
      cacheFor(path).replaceAll(fresh);
      bump();
    },
    [cacheFor, bump],
  );

  const refillFirstWindow = useCallback(
    async (path: string) => {
      cacheFor(path).put(0, await ipc.graphWindow(path, 0, CHUNK));
      bump();
    },
    [cacheFor, bump],
  );

  const fetchChunks = useCallback(
    (path: string, chunks: number[]) => {
      const cache = cacheFor(path);
      for (const chunk of chunks) {
        ipc
          .graphWindow(path, chunk * CHUNK, CHUNK)
          .then((window) => {
            cache.put(chunk, window);
            bump();
          })
          .catch(notifyError);
      }
    },
    [cacheFor, bump],
  );

  const drop = useCallback((path: string) => {
    caches.current.delete(path);
  }, []);

  return { cacheFor, refill, refillFirstWindow, fetchChunks, drop, version };
}
