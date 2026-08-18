import { pickAfterMove, samePick, type Picked } from '@/entities/repo';
import { useCommands } from '@/features/keyboard';
import { stepped } from '@/shared/lib/roving';
import type { PathOperation, StatusEntryView, WorkingTreeView } from '@/shared/api/types';
import { shownOrder, type FileView } from './order';

export function useFileNavigation({
  tree,
  unstaged,
  staged,
  view,
  descending,
  resolving,
  picked,
  diffOpen,
  onPick,
  onOpen,
  onRun,
}: {
  tree: WorkingTreeView;
  unstaged: readonly StatusEntryView[];
  staged: readonly StatusEntryView[];
  view: FileView;
  descending: boolean;
  resolving: boolean;
  picked: Picked | null;
  diffOpen: boolean;
  onPick: (picked: Picked | null) => void;
  onOpen: (path: string, status: string, staged: boolean) => void;
  onRun: (operation: PathOperation) => Promise<WorkingTreeView | null>;
}): {
  stageAt: (path: string) => void;
  unstageAt: (path: string) => void;
  openAt: (entry: StatusEntryView) => void;
} {
  const unstagedOrder = shownOrder(unstaged, view, descending);
  const stagedOrder = shownOrder(staged, view, descending);
  const order: Picked[] = [
    ...unstagedOrder.map((entry) => ({ path: entry.path, staged: false })),
    ...stagedOrder.map((entry) => ({ path: entry.path, staged: true })),
  ];
  const at = order.findIndex((seat) => samePick(seat, picked));

  const moveTo = (index: number) => {
    const next = order[index];
    if (!next) return;
    onPick(next);
    const entry = tree.entries.find((seat) => samePick(seat, next));
    if (diffOpen && entry) onOpen(entry.path, entry.letter, entry.staged);
  };

  const openAt = (entry: StatusEntryView) => {
    onPick({ path: entry.path, staged: entry.staged });
    onOpen(entry.path, entry.letter, entry.staged);
  };

  const moveAcross = (
    path: string,
    fromStaged: boolean,
    from: readonly StatusEntryView[],
    operation: PathOperation,
  ) => {
    void onRun(operation).then((fresh) => {
      if (!fresh) return;
      const seat = pickAfterMove(
        from.map((entry) => entry.path),
        path,
        fromStaged,
        fresh.entries,
      );
      onPick(seat);
      if (!diffOpen || !seat) return;
      const shown = fresh.entries.find((entry) => samePick(entry, seat));
      if (shown) onOpen(shown.path, shown.letter, shown.staged);
    });
  };

  const stageAt = (path: string) =>
    moveAcross(path, false, unstagedOrder, { kind: 'stage', paths: [path] });

  const unstageAt = (path: string) =>
    moveAcross(path, true, stagedOrder, {
      kind: resolving ? 'unresolve' : 'unstage',
      paths: [path],
    });

  const openPicked = () => {
    const entry =
      tree.entries.find((seat) => samePick(seat, picked)) ??
      (order[0] ? tree.entries.find((seat) => samePick(seat, order[0])) : undefined);
    if (entry) openAt(entry);
  };

  useCommands('app', { openSelected: openPicked });

  useCommands('files', {
    selectNext: () => moveTo(stepped(at, 1, order.length)),
    selectPrevious: () => moveTo(stepped(at, -1, order.length)),
    selectFirst: () => moveTo(0),
    selectLast: () => moveTo(order.length - 1),
    openSelected: openPicked,
    stageCurrent: () => {
      if (picked && !picked.staged) stageAt(picked.path);
    },
    unstageCurrent: () => {
      if (picked?.staged) unstageAt(picked.path);
    },
  });

  return { stageAt, unstageAt, openAt };
}
