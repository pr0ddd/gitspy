import { useCallback, useEffect, useRef, useState } from 'react';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';
import { AvatarCache, beacon } from '@/avatarCache';
import { remoteAvatarKey } from '@/entities/graph';
import type { SessionsAction } from '@/entities/repo';
import type { RecentRepo, RemoteView, WorkingTreeView } from '@/types';

type Wiring = {
  active: string | null;
  dispatch: (action: SessionsAction) => void;
  refill: (path: string) => Promise<void>;
  refillFirstWindow: (path: string) => Promise<void>;
  redraw: number;
  adoptTree: (tree: WorkingTreeView) => void;
  setRecent: (recent: RecentRepo[]) => void;
  remotes: RemoteView[] | undefined;
};

export function useRepoLoading({
  active,
  dispatch,
  refill,
  refillFirstWindow,
  redraw,
  adoptTree,
  setRecent,
  remotes,
}: Wiring) {
  const [avatarTick, setAvatarTick] = useState(0);
  const avatarsRef = useRef<AvatarCache | null>(null);
  if (avatarsRef.current === null) {
    avatarsRef.current = new AvatarCache(() => setAvatarTick((n) => n + 1));
  }
  const avatars = avatarsRef.current;

  useEffect(() => {
    if (!remotes) return;
    const urls = Object.fromEntries(
      remotes
        .filter((r) => r.avatarUrl)
        .map((r) => [remoteAvatarKey(r.avatarUrl as string), r.avatarUrl as string]),
    );
    avatars.refillRemote(urls);
  }, [remotes, avatars]);

  useEffect(() => {
    if (!active) return;
    ipc
      .avatarPaths(active)
      .then((paths) => {
        const sample = Object.entries(paths)[0];
        beacon(`paths n=${Object.keys(paths).length} sample=${sample ? sample.join(' -> ') : 'none'}`);
        return avatars.refill(paths).then(() => {
          const c = avatars.probeCounts();
          beacon(`refilled images=${c.images} ready=${c.ready}`);
        });
      })
      .catch((e) => {
        beacon(`paths-err ${String(e).slice(0, 120)}`);
      });

    const stop = ipc.onAvatarsChanged((path) => {
      if (path !== active) return;
      ipc
        .avatarPaths(path)
        .then((paths) => avatars.refill(paths))
        .catch(() => undefined);
    });
    return () => {
      void stop.then((off) => off());
    };
  }, [active, redraw, avatars]);

  const warmAvatars = useCallback(
    async (path: string, fresh: RemoteView[]) => {
      const urls = Object.fromEntries(
        fresh
          .filter((r) => r.avatarUrl)
          .map((r) => [remoteAvatarKey(r.avatarUrl as string), r.avatarUrl as string]),
      );
      const warmed = Promise.all([
        ipc
          .avatarPaths(path)
          .then((paths) => avatars.refill(paths))
          .catch(() => undefined),
        avatars.refillRemote(urls),
      ]);
      await Promise.race([warmed, new Promise((idle) => window.setTimeout(idle, 400))]);
    },
    [avatars],
  );

  const load = useCallback(
    async (path: string) => {
      try {
        const repo = await ipc.openRepo(path);
        await refill(path);
        await warmAvatars(path, repo.remotes);
        dispatch({ kind: 'loaded', path, repo });
        void ipc.resolveAvatars(path).catch(() => undefined);

        void ipc.recentRepos().then(setRecent);
        void ipc
          .worktrees(path)
          .then((worktrees) => dispatch({ kind: 'worktrees', path, worktrees }));
      } catch (e) {
        notifyError(e);
        dispatch({ kind: 'failed', path });
      }
    },
    [refill, warmAvatars, dispatch, setRecent],
  );

  const activeRef = useRef(active);
  activeRef.current = active;

  const reloading = useRef(new Map<string, Promise<void>>());
  const reload = useCallback(
    (path: string) => {
      const inFlight = reloading.current.get(path);
      if (inFlight) return inFlight;

      const run = (async () => {
        try {
          const repo = await ipc.openRepo(path);
          await refill(path);
          await warmAvatars(path, repo.remotes);
          dispatch({ kind: 'loaded', path, repo });
          if (activeRef.current === path) {
            void ipc.workingTree(path).then(adoptTree).catch(notifyError);
          }
          void ipc
            .worktrees(path)
            .then((worktrees) => dispatch({ kind: 'worktrees', path, worktrees }))
            .catch(() => undefined);
        } catch (e) {
          notifyError(e);
        } finally {
          reloading.current.delete(path);
        }
      })();
      reloading.current.set(path, run);
      return run;
    },
    [refill, warmAvatars, dispatch, adoptTree],
  );

  useEffect(() => {
    const stop = ipc.onRepoChanged((path) => {
      void reload(path);
    });
    return () => {
      void stop.then((off) => off());
    };
  }, [reload]);

  useEffect(() => {
    const stop = ipc.onWorktreeChanged(async (path) => {
      try {
        const tip = await ipc.refreshTip(path);
        if (tip.structureChanged) {
          await reload(path);
        } else {
          await refillFirstWindow(path);
        }
        if (path === active) ipc.workingTree(path).then(adoptTree).catch(notifyError);
      } catch {
        return;
      }
    });
    return () => {
      void stop.then((off) => off());
    };
  }, [active, reload, refillFirstWindow, adoptTree]);

  return { avatars, avatarTick, load, reload };
}
