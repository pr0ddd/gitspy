import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import * as ipc from '@/ipc';

const fake = vi.hoisted(() => {
  const disposable = { dispose: () => {} };
  const revealed: number[] = [];
  const hiddenCalls: Array<{ from: number; to: number }[]> = [];
  const zoneNodes: HTMLElement[] = [];
  const sideEditor = () => ({
    updateOptions: () => {},
    revealLineNearTop: (line: number) => {
      revealed.push(line);
    },
    getScrollTop: () => 0,
    setScrollTop: () => {},
    changeViewZones: (
      callback: (accessor: {
        addZone: (zone: { domNode: HTMLElement }) => string;
        removeZone: (id: string) => void;
      }) => void,
    ) => {
      callback({
        addZone: (zone) => {
          zoneNodes.push(zone.domNode);
          return 'zone';
        },
        removeZone: () => {},
      });
    },
    onDidScrollChange: () => disposable,
    onDidLayoutChange: () => disposable,
    getLayoutInfo: () => ({ contentWidth: 100 }),
    getScrollLeft: () => 0,
  });
  let model: { modified: { value: string } } | null = null;
  const original = sideEditor();
  const modified = sideEditor();
  const diffEditor = {
    setModel: (next: unknown) => {
      model = next as { modified: { value: string } };
    },
    getModel: () => model,
    updateOptions: () => {},
    getOriginalEditor: () => original,
    getModifiedEditor: () => modified,
    onDidUpdateDiff: () => disposable,
    getLineChanges: () => [],
    revealFirstDiff: () => {},
    goToDiff: () => {},
    dispose: () => {},
  };
  return {
    diffEditor,
    revealed,
    hiddenCalls,
    zoneNodes,
    shownText: () => model?.modified.value ?? null,
    reset: () => {
      model = null;
      revealed.length = 0;
      hiddenCalls.length = 0;
      zoneNodes.length = 0;
    },
  };
});

vi.mock('@/entities/diff', async () => ({
  ...(await vi.importActual<object>('@/entities/diff/diff')),
  ...(await vi.importActual<object>('@/entities/diff/hunks')),
  DIFF_EDITOR_BASE: {},
  EDITOR_BASE: {},
  languageOf: () => 'plaintext',
  setUpMonaco: () => {},
  userEditorOptions: () => ({}),
  setHiddenLineSpans: (_editor: unknown, spans: { from: number; to: number }[]) => {
    fake.hiddenCalls.push(spans);
  },
  monaco: {
    editor: {
      createDiffEditor: () => fake.diffEditor,
      create: () => ({
        getModel: () => null,
        getValue: () => '',
        addCommand: () => {},
        dispose: () => {},
      }),
      createModel: (value: string, language: string) => ({ value, language, dispose: () => {} }),
      ScrollType: { Immediate: 1 },
      ShowLightbulbIconMode: { Off: 'off' },
    },
    KeyMod: { CtrlCmd: 0 },
    KeyCode: { KeyS: 0 },
  },
}));
vi.mock('@/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  diffSides: vi.fn(() => Promise.resolve({ before: '', after: '' })),
  commitFileHunks: vi.fn(() => Promise.resolve('')),
}));
import '../i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DiffView, sameDiffTarget, type DiffTarget } from './DiffView';
import type { ChangedFileView } from '@/types';

beforeEach(() => {
  localStorage.clear();
  fake.reset();
});

const fileNamed = (path: string): ChangedFileView => ({
  status: 'M',
  path,
  oldPath: null,
  similarity: null,
  added: 1,
  deleted: 1,
  binary: false,
});

const targetFor = (commit: string, path: string): DiffTarget => ({
  kind: 'commit',
  commit,
  file: fileNamed(path),
});

const view = (target: DiffTarget) => (
  <TooltipProvider>
    <DiffView
      repo="/repo"
      target={target}
      onClose={() => {}}
      onTree={() => {}}
      onRun={() => {}}
      onTarget={() => {}}
      onHistory={() => {}}
    />
  </TooltipProvider>
);

const editorHost = (container: HTMLElement): HTMLElement => {
  const host = container.querySelector<HTMLElement>('div.min-h-0.flex-1:not(.flex-col)');
  if (!host) throw new Error('контейнер diff-редактора не найден');
  return host;
};

const patchAt = (newStart: number) => `@@ -${newStart},2 +${newStart},2 @@\n-a\n+b\n c\n`;

describe('смена файла в diff-редакторе', () => {
  it('вид собирается целиком до подмены: прокрутка из патча, без ожидания диффа', async () => {
    let releaseSecondSides: (sides: { before: string; after: string }) => void = () => {};
    vi.mocked(ipc.diffSides).mockImplementation((_repo, commit) =>
      commit === 'aaaa0000'
        ? Promise.resolve({ before: 'old before', after: 'old after' })
        : new Promise((resolve) => {
            releaseSecondSides = resolve;
          }),
    );
    vi.mocked(ipc.commitFileHunks).mockImplementation((_repo, commit) =>
      Promise.resolve(patchAt(commit === 'aaaa0000' ? 7 : 3)),
    );

    const first = targetFor('aaaa0000', 'src/old.ts');
    const { container, rerender } = render(view(first));
    await act(async () => {});
    expect(fake.shownText(), 'после прихода данных показан новый текст').toBe('old after');
    expect(
      fake.revealed,
      'прокрутка к первому ханку происходит сразу из патча, а не после пересчёта диффа',
    ).toEqual([7]);

    rerender(view(targetFor('bbbb0000', 'src/new.ts')));
    await act(async () => {});
    expect(
      fake.shownText(),
      'пока грузится новый файл, прежнее содержимое остаётся на месте',
    ).toBe('old after');
    expect(
      editorHost(container).className.includes('invisible'),
      'редактор не прячется на время загрузки',
    ).toBe(false);

    await act(async () => releaseSecondSides({ before: 'new before', after: 'new after' }));
    expect(fake.shownText(), 'новый файл подменил старый одним шагом').toBe('new after');
    expect(fake.revealed, 'новый файл прокручен к своему первому ханку').toEqual([7, 3]);
  });

  it('в hunk-режиме строки вне ханков прячутся сразу, а плашка заголовка уже заполнена', async () => {
    localStorage.setItem('gitspy.diff.mode', '"hunk"');
    vi.mocked(ipc.diffSides).mockResolvedValue({
      before: Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n'),
      after: Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n'),
    });
    vi.mocked(ipc.commitFileHunks).mockResolvedValue(patchAt(4));

    const { container } = render(view(targetFor('cccc0000', 'src/some.ts')));
    await act(async () => {});

    expect(
      fake.hiddenCalls.some((spans) => spans.length > 0),
      'строки вне ханков скрыты в том же проходе, что и подмена модели',
    ).toBe(true);
    expect(fake.zoneNodes.length, 'на каждый ханк добавлена зона с плашкой').toBe(1);
    expect(
      fake.zoneNodes[0].textContent ?? '',
      'плашка ханка заполнена синхронно, без пустого кадра',
    ).toContain('@@ -4,2 +4,2 @@');
    expect(container.querySelector('.min-h-0')).toBeTruthy();
  });
});

describe('повторный клик по той же цели', () => {
  it('одна и та же цель узнаётся по содержимому, а не по ссылке', () => {
    expect(
      sameDiffTarget(targetFor('aaaa0000', 'src/a.ts'), targetFor('aaaa0000', 'src/a.ts')),
      'два клика по одному файлу коммита дают одну цель — по ней дифф закрывается',
    ).toBe(true);
    expect(sameDiffTarget(targetFor('aaaa0000', 'src/a.ts'), targetFor('bbbb0000', 'src/a.ts'))).toBe(
      false,
    );
    expect(sameDiffTarget(targetFor('aaaa0000', 'src/a.ts'), targetFor('aaaa0000', 'src/b.ts'))).toBe(
      false,
    );
  });

  it('файл рабочего дерева различается путём и корзиной', () => {
    const tree = (path: string, staged: boolean): DiffTarget => ({
      kind: 'workingTree',
      path,
      status: 'M',
      staged,
    });
    expect(sameDiffTarget(tree('a.ts', false), tree('a.ts', false))).toBe(true);
    expect(
      sameDiffTarget(tree('a.ts', false), tree('a.ts', true)),
      'staged и unstaged версии файла — разные панели',
    ).toBe(false);
    expect(sameDiffTarget(tree('a.ts', false), targetFor('aaaa0000', 'a.ts'))).toBe(false);
  });
});
