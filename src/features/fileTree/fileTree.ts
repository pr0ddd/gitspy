import type { StatusEntryView } from '@/types';

export type FileNode =
  | { kind: 'folder'; name: string; path: string; children: FileNode[] }
  | { kind: 'file'; name: string; path: string; entry: StatusEntryView };

type Draft = {
  folders: Map<string, Draft>;
  files: StatusEntryView[];
};

const emptyDraft = (): Draft => ({ folders: new Map(), files: [] });

const place = (draft: Draft, segments: string[], entry: StatusEntryView) => {
  if (segments.length === 1) {
    draft.files.push(entry);
    return;
  }
  const [head, ...rest] = segments;
  const next = draft.folders.get(head) ?? emptyDraft();
  draft.folders.set(head, next);
  place(next, rest, entry);
};

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const collapseLoneFolder = (node: FileNode): FileNode => {
  if (node.kind !== 'folder') return node;
  const [only] = node.children;
  if (node.children.length !== 1 || only.kind !== 'folder') return node;
  return { ...only, name: `${node.name}/${only.name}` };
};

const harvest = (draft: Draft, prefix: string, descending: boolean): FileNode[] => {
  const order = descending ? -1 : 1;

  const folders: FileNode[] = [...draft.folders.entries()]
    .map(([name, child]) => {
      const path = prefix ? `${prefix}/${name}` : name;
      return collapseLoneFolder({
        kind: 'folder',
        name,
        path,
        children: harvest(child, path, descending),
      });
    })
    .sort((a, b) => order * byName.compare(a.name, b.name));

  const files: FileNode[] = draft.files
    .map((entry) => ({
      kind: 'file' as const,
      name: entry.path.slice(entry.path.lastIndexOf('/') + 1),
      path: entry.path,
      entry,
    }))
    .sort((a, b) => order * byName.compare(a.name, b.name));

  return [...folders, ...files];
};

export const buildFileTree = (
  entries: readonly StatusEntryView[],
  descending = false,
): FileNode[] => {
  const root = emptyDraft();
  for (const entry of entries) place(root, entry.path.split('/'), entry);
  return harvest(root, '', descending);
};

export const sortedByPath = (
  entries: readonly StatusEntryView[],
  descending = false,
): StatusEntryView[] =>
  [...entries].sort((a, b) => (descending ? -1 : 1) * byName.compare(a.path, b.path));

export const filesOf = (nodes: readonly FileNode[]): StatusEntryView[] =>
  nodes.flatMap((node) => (node.kind === 'file' ? [node.entry] : filesOf(node.children)));
