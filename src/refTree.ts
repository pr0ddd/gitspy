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

const collapseLoneFolder = (node: TreeNode): TreeNode => {
  if (node.kind !== 'folder') return node;
  const [only] = node.children;
  if (node.children.length !== 1 || only.kind !== 'folder') return node;
  return { ...only, name: `${node.name}/${only.name}` };
};

const harvest = (draft: Draft, prefix: string): TreeNode[] => {
  const folders: TreeNode[] = [...draft.folders.entries()].map(([name, child]) => {
    const path = prefix ? `${prefix}/${name}` : name;
    return collapseLoneFolder({ kind: 'folder', name, path, children: harvest(child, path) });
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

export const filterRefTree = (tree: TreeNode[], needle: string): TreeNode[] => {
  const query = needle.trim().toLowerCase();
  if (!query) return tree;

  return tree.flatMap<TreeNode>((node) => {
    if (node.kind === 'ref') {
      return node.path.toLowerCase().includes(query) ? [node] : [];
    }
    const children = filterRefTree(node.children, query);
    return children.length ? [{ ...node, children }] : [];
  });
};

export type FlatRef =
  | { kind: 'folder'; name: string; path: string; depth: number; open: boolean }
  | { kind: 'ref'; name: string; path: string; depth: number; ref: RefView };

export const flattenRefTree = (
  tree: TreeNode[],
  closed: ReadonlySet<string>,
  depth = 0,
): FlatRef[] =>
  tree.flatMap<FlatRef>((node) => {
    if (node.kind === 'ref') {
      return [{ kind: 'ref', name: node.name, path: node.path, depth, ref: node.ref }];
    }
    const open = !closed.has(node.path);
    const row: FlatRef = { kind: 'folder', name: node.name, path: node.path, depth, open };
    return open ? [row, ...flattenRefTree(node.children, closed, depth + 1)] : [row];
  });

