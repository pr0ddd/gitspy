import { useCallback, useEffect, useState } from 'react';
import * as ipc from '@/shared/api/ipc';
import { hostOf, PULLS_IDLE, pullsAfterFailure, type PullsState } from '@/entities/repo';
import type { PullListView, RemoteView } from '@/shared/api/types';
import { noteHostError } from './hosts';

const CACHE_FRESH_FOR_S = 300;

export function usePullRequests(
  active: string | null,
  remotes: readonly RemoteView[] | undefined,
): { pulls: PullsState; loadPulls: () => void; host: string | null } {
  const [pulls, setPulls] = useState<PullsState>(PULLS_IDLE);
  const host = remotes ? hostOf(remotes) : null;
  const remotesKey = remotes?.map((remote) => remote.webUrl ?? remote.name).join('\n');

  useEffect(() => {
    setPulls(PULLS_IDLE);
    if (!active || remotesKey === undefined) return;
    if (!host) {
      setPulls({ kind: 'noHost' });
      return;
    }

    let alive = true;
    const stale = (view: PullListView) => Date.now() / 1000 - view.fetchedAt > CACHE_FRESH_FOR_S;
    setPulls({ kind: 'loading' });
    ipc
      .pullRequests(active, false, true)
      .then((known) => {
        if (!alive || !known) return;
        setPulls({ kind: 'ready', list: known });
        if (!stale(known)) return;
        return ipc.pullRequests(active, true, true).then((fresh) => {
          if (alive && fresh) setPulls({ kind: 'ready', list: fresh });
        });
      })
      .catch((error: unknown) => {
        noteHostError(host, error);
        if (alive) setPulls(pullsAfterFailure(error, host));
      });
    return () => {
      alive = false;
    };
  }, [active, host, remotesKey]);

  const loadPulls = useCallback(() => {
    if (!active) return;
    if (!host) {
      setPulls({ kind: 'noHost' });
      return;
    }
    setPulls((prev) => (prev.kind === 'ready' ? prev : { kind: 'loading' }));
    ipc
      .pullRequests(active, pulls.kind === 'ready', true)
      .then((known) => known && setPulls({ kind: 'ready', list: known }))
      .catch((error: unknown) => {
        noteHostError(host, error);
        setPulls(pullsAfterFailure(error, host));
      });
    void ipc.resolveAvatars(active).catch(() => undefined);
  }, [active, host, pulls.kind]);

  return { pulls, loadPulls, host };
}
