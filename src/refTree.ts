import type { RefView } from './types';

export type TreeNode =
  | { kind: 'folder'; name: string; path: string; children: TreeNode[] }
  | { kind: 'ref'; name: string; path: string; ref: RefView };

type Draft = {
  folders: Map<string, Draft>;
  refs: RefView[];
};

const emptyDraft = (): Draft => ({ folders: new Map(), refs: [] });

const place = (draft: Draft, segments: string[], ref: RefView) => {
  if (segments.length === 1) {
    draft.refs.push(ref);
    return;
  }
  const [head, ...rest] = segments;
  const next = draft.folders.get(head) ?? emptyDraft();
  draft.folders.set(head, next);
  place(next, rest, ref);
};

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const harvest = (draft: Draft, prefix: string): TreeNode[] => {
  const folders: TreeNode[] = [...draft.folders.entries()].map(([name, child]) => {
    const path = prefix ? `${prefix}/${name}` : name;
    return { kind: 'folder', name, path, children: harvest(child, path) };
  });

  const leaves: TreeNode[] = draft.refs.map((ref) => ({
    kind: 'ref',
    name: ref.name.slice(ref.name.lastIndexOf('/') + 1),
    path: ref.name,
    ref,
  }));

  const leafBeforeFolderOnEqualNames = (a: TreeNode, b: TreeNode) =>
    a.kind === b.kind ? 0 : a.kind === 'ref' ? -1 : 1;

  return [...folders, ...leaves].sort(
    (a, b) => byName.compare(a.name, b.name) || leafBeforeFolderOnEqualNames(a, b),
  );
};

export const buildRefTree = (refs: RefView[]): TreeNode[] => {
  const root = emptyDraft();
  for (const ref of refs) place(root, ref.name.split('/'), ref);
  return harvest(root, '');
};

export const openPathsFor = (tree: TreeNode[], needle: string): Set<string> => {
  const query = needle.trim().toLowerCase();
  const open = new Set<string>();
  if (!query) return open;

  const visit = (nodes: TreeNode[]): boolean =>
    nodes.reduce((found, node) => {
      if (node.kind === 'ref') {
        return node.path.toLowerCase().includes(query) || found;
      }
      const inside = visit(node.children);
      if (inside) open.add(node.path);
      return inside || found;
    }, false);

  visit(tree);
  return open;
};
