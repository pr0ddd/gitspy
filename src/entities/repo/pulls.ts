import type { PullView, RefView } from '@/types';

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
