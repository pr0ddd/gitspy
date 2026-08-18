import { buildFileTree, filesOf, sortedByPath } from '@/features/fileTree';
import type { StatusEntryView } from '@/shared/api/types';

export type FileView = 'path' | 'tree';

export const shownOrder = (
  entries: readonly StatusEntryView[],
  view: FileView,
  descending: boolean,
): StatusEntryView[] =>
  view === 'tree' ? filesOf(buildFileTree(entries, descending)) : sortedByPath(entries, descending);
