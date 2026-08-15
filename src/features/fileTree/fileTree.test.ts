import { describe, expect, it } from 'vitest';
import { buildFileTree, filesOf, foldersOf, sortedByPath, tallyByLetter } from './fileTree';
import type { StatusEntryView } from '@/types';

const entry = (path: string, letter = 'M'): StatusEntryView => ({
  staged: false,
  letter,
  path,
  oldPath: null,
});

const shape = (nodes: ReturnType<typeof buildFileTree>): string[] =>
  nodes.flatMap((node) =>
    node.kind === 'file'
      ? [node.name]
      : [`${node.name}/`, ...shape(node.children).map((s) => `  ${s}`)],
  );

describe('дерево файлов рабочего копии', () => {
  it('складывает файлы по каталогам, а не оставляет плоский список', () => {
    const tree = buildFileTree([entry('src/App.tsx'), entry('src/scene.ts'), entry('README.md')]);

    expect(shape(tree)).toEqual(['src/', '  App.tsx', '  scene.ts', 'README.md']);
  });

  it('каталог-одиночка слипается с потомком, иначе панель уходит в лесенку', () => {
    const tree = buildFileTree([entry('crates/gitspy-core/src/state.rs')]);

    expect(shape(tree), 'три каталога без развилки — одна строка').toEqual([
      'crates/gitspy-core/src/',
      '  state.rs',
    ]);
  });

  it('развилка останавливает слипание: у каталога снова есть выбор', () => {
    const tree = buildFileTree([entry('crates/core/a.rs'), entry('crates/repo/b.rs')]);

    expect(shape(tree)).toEqual(['crates/', '  core/', '    a.rs', '  repo/', '    b.rs']);
  });

  it('каталоги идут раньше файлов на своём уровне', () => {
    const tree = buildFileTree([entry('a.txt'), entry('zz/b.txt')]);

    expect(shape(tree)).toEqual(['zz/', '  b.txt', 'a.txt']);
  });

  it('обратный порядок переворачивает и каталоги, и файлы внутри них', () => {
    const tree = buildFileTree([entry('src/a.ts'), entry('src/b.ts'), entry('docs/c.md')], true);

    expect(shape(tree)).toEqual(['src/', '  b.ts', '  a.ts', 'docs/', '  c.md']);
  });

  it('плоский вид сортирует по всему пути, а не по имени файла', () => {
    const sorted = sortedByPath([entry('src/z.ts'), entry('docs/a.md')]);

    expect(sorted.map((e) => e.path)).toEqual(['docs/a.md', 'src/z.ts']);
  });

  it('обход дерева отдаёт ровно те же файлы, что вошли', () => {
    const paths = ['src/App.tsx', 'crates/core/src/lib.rs', 'README.md'];

    expect(
      filesOf(buildFileTree(paths.map((path) => entry(path))))
        .map((e) => e.path)
        .sort(),
    ).toEqual([...paths].sort());
  });

  it('каталоги перечисляются целыми путями: по ним и открывается свёрнутая ветка дерева', () => {
    const tree = buildFileTree([
      entry('src/app/App.tsx'),
      entry('docs/plan.md'),
      entry('README.md'),
    ]);

    expect(foldersOf(tree)).toEqual(['docs', 'src/app']);
  });

  it('свёрнутый каталог показывает, что внутри: по букве статуса со счётом', () => {
    const tree = buildFileTree([
      entry('src/a.ts', 'M'),
      entry('src/b.ts', 'M'),
      entry('src/c.ts', '?'),
      entry('src/d.ts', 'D'),
    ]);

    expect(
      tallyByLetter(tree),
      'неотслеживаемый файл считается добавленным, порядок букв — от добавленных к удалённым',
    ).toEqual([
      { letter: 'A', count: 1 },
      { letter: 'M', count: 2 },
      { letter: 'D', count: 1 },
    ]);
  });
});
