import type { PathOperation, WorkingTreeView } from '@/shared/api/types';

const NEEDS_STAGED_SIDE: Record<string, boolean> = {
  stage: false,
  discard: false,
  unstage: true,
  unresolve: true,
};

export function stillNeeded(
  operation: PathOperation,
  tree: WorkingTreeView | null,
): PathOperation | null {
  if (!tree || !('paths' in operation)) return operation;
  const staged = NEEDS_STAGED_SIDE[operation.kind];
  const paths = operation.paths.filter((path) =>
    tree.entries.some((entry) => entry.path === path && entry.staged === staged),
  );
  if (paths.length === 0) return null;
  if (paths.length === operation.paths.length) return operation;
  return { ...operation, paths };
}

const queues = new Map<string, Promise<WorkingTreeView | null>>();

export function queuePathOperation(
  repo: string,
  operation: PathOperation,
  tree: WorkingTreeView | null,
  perform: (operation: PathOperation) => Promise<WorkingTreeView>,
): Promise<WorkingTreeView | null> {
  const waiting = queues.get(repo) ?? Promise.resolve(tree);
  const running = waiting.then((latest) => {
    const needed = stillNeeded(operation, latest);
    return needed ? perform(needed) : latest;
  });
  const settled = running.catch(() => null);
  queues.set(repo, settled);
  void settled.then(() => {
    if (queues.get(repo) === settled) queues.delete(repo);
  });
  return running;
}
