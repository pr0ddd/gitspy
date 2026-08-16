import type { ChangedFileView } from '@/shared/api/types';

export type DiffTarget =
  | { kind: 'commit'; commit: string; file: ChangedFileView }
  | { kind: 'workingTree'; path: string; status: string; staged: boolean };

export const sameDiffTarget = (left: DiffTarget, right: DiffTarget): boolean => {
  if (left.kind === 'commit' && right.kind === 'commit') {
    return left.commit === right.commit && left.file.path === right.file.path;
  }
  if (left.kind === 'workingTree' && right.kind === 'workingTree') {
    return left.path === right.path && left.staged === right.staged;
  }
  return false;
};
