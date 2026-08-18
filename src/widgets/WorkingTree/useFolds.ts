import { useCallback, useState } from 'react';
import { buildFileTree, foldersOf } from '@/features/fileTree';
import type { StatusEntryView } from '@/shared/api/types';

export type Folds = {
  isOpen: (path: string) => boolean;
  toggle: (path: string) => void;
  reveal: (filePath: string) => void;
};

export const ALWAYS_OPEN: Folds = { isOpen: () => true, toggle: () => {}, reveal: () => {} };

const ancestorsOf = (filePath: string): string[] =>
  filePath
    .split('/')
    .slice(0, -1)
    .map((_, at, all) => all.slice(0, at + 1).join('/'));

export function useFolds(entries: readonly StatusEntryView[]): Folds & {
  allClosed: boolean;
  foldAll: (open: boolean) => void;
} {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  const widen = useCallback((paths: readonly string[]) => {
    setOpen((was) => {
      if (paths.every((path) => was.has(path))) return was;
      const next = new Set(was);
      for (const path of paths) next.add(path);
      return next;
    });
  }, []);

  const toggle = useCallback((path: string) => {
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }, []);

  const reveal = useCallback((filePath: string) => widen(ancestorsOf(filePath)), [widen]);

  const foldAll = useCallback(
    (unfold: boolean) => setOpen(unfold ? new Set(foldersOf(buildFileTree(entries))) : new Set()),
    [entries],
  );

  return {
    isOpen: useCallback((path: string) => open.has(path), [open]),
    toggle,
    reveal,
    allClosed: open.size === 0,
    foldAll,
  };
}
