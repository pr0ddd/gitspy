import { describe, expect, it } from 'vitest';
import { buildRefTree, openPathsFor, type TreeNode } from './refTree';
import type { RefView } from './types';

const ref = (name: string): RefView => ({
  name,
  kind: 'localBranch',
  commit: 0,
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
});

const shape = (nodes: TreeNode[], depth = 0): string[] =>
  nodes.flatMap((node) => [
    `${'  '.repeat(depth)}${node.kind === 'folder' ? `${node.name}/` : node.name}`,
    ...(node.kind === 'folder' ? shape(node.children, depth + 1) : []),
  ]);

describe('buildRefTree', () => {
  it('режет имя по слэшам и не схлопывает цепочку из одного ребёнка', () => {
    const tree = buildRefTree([ref('fixtures/packaging/brunch/dev/minimatch-3.1.5')]);
    expect(shape(tree)).toEqual([
      'fixtures/',
      '  packaging/',
      '    brunch/',
      '      dev/',
      '        minimatch-3.1.5',
    ]);
  });

  it('держит папки и листья в общем алфавитном порядке, не поднимая папки наверх', () => {
    const tree = buildRefTree([ref('develop'), ref('ci/daemon-workflow'), ref('feat/x')]);
    expect(shape(tree)).toEqual(['ci/', '  daemon-workflow', 'develop', 'feat/', '  x']);
  });

  it('даёт листу полное имя, потому что по нему выполняется checkout', () => {
    const tree = buildRefTree([ref('pr/36451')]);
    const folder = tree[0];
    expect(folder.kind).toBe('folder');
    if (folder.kind !== 'folder') return;
    expect(folder.children[0].name).toBe('36451');
    expect(folder.children[0].path).toBe('pr/36451');
  });

  it('ветка и папка с одним именем не сливаются, и ветка идёт первой', () => {
    const tree = buildRefTree([ref('feat'), ref('feat/x')]);
    expect(shape(tree)).toEqual(['feat', 'feat/', '  x']);
  });

  it('порядок при равных именах задан правилом, а не устойчивостью сортировки', () => {
    const folderFirst = buildRefTree([ref('feat/x'), ref('feat')]);
    const leafFirst = buildRefTree([ref('feat'), ref('feat/x')]);
    expect(shape(folderFirst)).toEqual(shape(leafFirst));
  });

  it('удалённая ветка держит remote первым сегментом', () => {
    const tree = buildRefTree([ref('origin/dev/x')]);
    expect(shape(tree)).toEqual(['origin/', '  dev/', '    x']);
  });

  it('пустой список даёт пустое дерево, а не корень из ничего', () => {
    expect(buildRefTree([])).toEqual([]);
  });
});

describe('openPathsFor', () => {
  it('раскрывает ровно те ветви, где есть совпадение', () => {
    const tree = buildRefTree([ref('ci/daemon-workflow'), ref('feat/login')]);
    expect(openPathsFor(tree, 'daemon')).toEqual(new Set(['ci']));
  });

  it('сравнивает с полным именем, а не с подписью листа', () => {
    const tree = buildRefTree([ref('ci/daemon-workflow')]);
    expect(openPathsFor(tree, 'ci/daemon')).toEqual(new Set(['ci']));
  });

  it('раскрывает всю цепочку до совпадения, а не только верхнюю папку', () => {
    const tree = buildRefTree([ref('a/b/c/target')]);
    expect(openPathsFor(tree, 'target')).toEqual(new Set(['a', 'a/b', 'a/b/c']));
  });

  it('пустой запрос ничего не раскрывает', () => {
    const tree = buildRefTree([ref('ci/daemon-workflow')]);
    expect(openPathsFor(tree, '   ')).toEqual(new Set());
  });
});
