import { isNoConnection } from '@/shared/api/errors';
import type { PullListView, PullView, RefView } from '@/shared/api/types';
import type { HostKind } from './host';

export type PullsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; list: PullListView }
  | { kind: 'noHost' }
  | { kind: 'notConnected'; host: HostKind }
  | { kind: 'failed' };

export const PULLS_IDLE: PullsState = { kind: 'idle' };

export const pullsOf = (state: PullsState): readonly PullView[] =>
  state.kind === 'ready' ? state.list.pulls : [];

export const pullsAfterFailure = (error: unknown, host: HostKind): PullsState =>
  isNoConnection(error) ? { kind: 'notConnected', host } : { kind: 'failed' };

export const pullAtRefs = (
  refs: readonly RefView[],
  pulls: readonly PullView[],
): PullView | null => {
  for (const pull of pulls) {
    if (pull.fromFork) continue;
    for (const ref of refs) {
      if (ref.kind === 'localBranch' && ref.name === pull.headBranch) return pull;
      if (ref.kind === 'remoteBranch' && ref.name.endsWith(`/${pull.headBranch}`)) return pull;
    }
  }
  return null;
};
