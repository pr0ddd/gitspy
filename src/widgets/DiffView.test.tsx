import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import * as ipc from '@/ipc';

const fake = vi.hoisted(() => {
  const disposable = { dispose: () => {} };
  const revealed: number[] = [];
  const hiddenCalls: Array<{ from: number; to: number }[]> = [];
  const zoneNodes: HTMLElement[] = [];
  const zonesWhileAttaching: boolean[] = [];
  const scrolledTo: number[] = [];
  const events: string[] = [];
  const disposed: string[] = [];
  const modelListeners = new Set<() => void>();
  let attaching = false;
  const sideEditor = () => ({
    updateOptions: () => {},
    revealLineNearTop: (line: number) => {
      revealed.push(line);
    },
    getScrollTop: () => 0,
    setScrollTop: (top: number) => {
      scrolledTo.push(top);
    },
    onDidChangeModel: (listener: () => void) => {
      modelListeners.add(listener);
      return { dispose: () => modelListeners.delete(listener) };
    },
    changeViewZones: (
      callback: (accessor: {
        addZone: (zone: { domNode: HTMLElement }) => string;
        removeZone: (id: string) => void;
      }) => void,
    ) => {
      callback({
        addZone: (zone) => {
          zoneNodes.push(zone.domNode);
          zonesWhileAttaching.push(attaching);
          events.push('zone');
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
  type FakeModel = { value: string; dispose: () => void };
  type FakeViewModel = {
    model: { original: FakeModel; modified: FakeModel };
    waitForDiff: () => Promise<void>;
    dispose: () => void;
  };
  let attached: FakeViewModel['model'] | null = null;
  let compare: (() => void) | null = null;
  const holding = { compare: false };
  const original = sideEditor();
  const modified = sideEditor();
  const diffEditor = {
    createViewModel: (model: FakeViewModel['model']): FakeViewModel => ({
      model,
      waitForDiff: () =>
        holding.compare
          ? new Promise<void>((resolve) => {
              compare = resolve;
            })
          : Promise.resolve(),
      dispose: () => {
        disposed.push(`vm:${model.modified.value}`);
      },
    }),
    setModel: (next: FakeViewModel | null) => {
      const model = next?.model ?? null;
      if (model === attached) return;
      attaching = true;
      events.push(model ? `attach:${model.modified.value}` : 'detach');
      attached = model;
      modelListeners.forEach((listener) => listener());
      attaching = false;
    },
    getModel: () => attached,
    updateOptions: () => {},
    getOriginalEditor: () => original,
    getModifiedEditor: () => modified,
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
    zonesWhileAttaching,
    scrolledTo,
    events,
    disposed,
    holding,
    finishCompare: () => compare?.(),
    shownText: () => attached?.modified.value ?? null,
    reset: () => {
      attached = null;
      compare = null;
      holding.compare = false;
      attaching = false;
      modelListeners.clear();
      revealed.length = 0;
      hiddenCalls.length = 0;
      zoneNodes.length = 0;
      zonesWhileAttaching.length = 0;
      scrolledTo.length = 0;
      events.length = 0;
      disposed.length = 0;
    },
  };
});

vi.mock('@/entities/diff', async () => ({
  ...(await vi.importActual<object>('@/entities/diff/diff')),
  ...(await vi.importActual<object>('@/entities/diff/hunks')),
  ...(await vi.importActual<object>('@/entities/diff/attach')),
  DIFF_EDITOR_BASE: {},
  EDITOR_BASE: {},
  languageOf: () => 'plaintext',
  setUpMonaco: () => {},
  userEditorOptions: () => ({}),
  setHiddenLineSpans: (_editor: unknown, spans: { from: number; to: number }[]) => {
    fake.hiddenCalls.push(spans);
    fake.events.push('hidden');
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
      createModel: (value: string, language: string) => ({
        value,
        language,
        dispose: () => {
          fake.disposed.push(`model:${value}`);
        },
      }),
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
    expect(fake.shownText(), 'пока грузится новый файл, прежнее содержимое остаётся на месте').toBe(
      'old after',
    );
    expect(
      editorHost(container).className.includes('invisible'),
      'редактор не прячется на время загрузки',
    ).toBe(false);

    await act(async () => releaseSecondSides({ before: 'new before', after: 'new after' }));
    expect(fake.shownText(), 'новый файл подменил старый одним шагом').toBe('new after');
    expect(fake.revealed, 'новый файл прокручен к своему первому ханку').toEqual([7, 3]);
  });

  it('подмена ждёт готового сравнения: старый файл стоит, пока новый не выровнен', async () => {
    localStorage.setItem('gitspy.diff.mode', '"hunk"');
    vi.mocked(ipc.diffSides).mockImplementation((_repo, commit) =>
      Promise.resolve(
        commit === 'aaaa0000'
          ? { before: 'old before', after: 'old after' }
          : { before: 'new before', after: 'new after' },
      ),
    );
    vi.mocked(ipc.commitFileHunks).mockResolvedValue(patchAt(1));

    const { rerender } = render(view(targetFor('aaaa0000', 'src/old.ts')));
    await act(async () => {});
    expect(fake.shownText()).toBe('old after');

    fake.holding.compare = true;
    rerender(view(targetFor('bbbb0000', 'src/new.ts')));
    await act(async () => {});
    expect(
      fake.shownText(),
      'текст пришёл, но дифф ещё считается — на экране прежний файл, без кадра с невыровненной колонкой',
    ).toBe('old after');
    expect(fake.scrolledTo, 'и прокрутка нового файла ещё не трогалась').toEqual([0]);

    await act(async () => fake.finishCompare());
    expect(fake.shownText(), 'дифф посчитан — новый файл встал разом').toBe('new after');
    expect(fake.scrolledTo, 'и сразу прокручен к началу, в том же проходе').toEqual([0, 0]);
  });

  it('прежние модели и сравнение освобождаются после подмены, а брошенные на полпути — при отмене', async () => {
    vi.mocked(ipc.diffSides).mockImplementation((_repo, commit) =>
      Promise.resolve({ before: `${commit} before`, after: `${commit} after` }),
    );
    vi.mocked(ipc.commitFileHunks).mockResolvedValue(patchAt(1));

    const { rerender } = render(view(targetFor('aaaa0000', 'src/a.ts')));
    await act(async () => {});
    rerender(view(targetFor('bbbb0000', 'src/b.ts')));
    await act(async () => {});
    expect(
      fake.disposed,
      'после подмены первый файл освобождён целиком: обе модели и сравнение',
    ).toEqual(
      expect.arrayContaining([
        'vm:aaaa0000 after',
        'model:aaaa0000 before',
        'model:aaaa0000 after',
      ]),
    );
    expect(
      fake.disposed.filter((entry) => entry.includes('bbbb0000')),
      'показанный файл жив',
    ).toEqual([]);

    fake.holding.compare = true;
    rerender(view(targetFor('cccc0000', 'src/c.ts')));
    await act(async () => {});
    rerender(view(targetFor('dddd0000', 'src/d.ts')));
    await act(async () => {});
    expect(
      fake.disposed.filter((entry) => entry.includes('cccc0000')),
      'файл, чьё сравнение не дождались, освобождён при отмене',
    ).toEqual(
      expect.arrayContaining([
        'vm:cccc0000 after',
        'model:cccc0000 before',
        'model:cccc0000 after',
      ]),
    );
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

  it('полосы ханков встают, пока модель прикрепляется: Monaco выравнивает левую колонку в том же проходе, а скрытие строк идёт после', async () => {
    localStorage.setItem('gitspy.diff.mode', '"hunk"');
    vi.mocked(ipc.diffSides).mockResolvedValue({ before: 'a\nb\nc', after: 'a\nx\nc' });
    vi.mocked(ipc.commitFileHunks).mockResolvedValue(patchAt(2));

    render(view(targetFor('cccc0000', 'src/some.ts')));
    await act(async () => {});

    expect(
      fake.zonesWhileAttaching,
      'зона добавлена внутри setModel — иначе левая колонка узнаёт о ней по setTimeout и прыгает',
    ).toEqual([true]);
    expect(
      fake.events,
      'порядок: прикрепление с зоной внутри, затем скрытие строк на обеих сторонах — Monaco сбрасывает скрытые области при подмене модели',
    ).toEqual(['attach:a\nx\nc', 'zone', 'hidden', 'hidden']);
  });
});

describe('повторный клик по той же цели', () => {
  it('одна и та же цель узнаётся по содержимому, а не по ссылке', () => {
    expect(
      sameDiffTarget(targetFor('aaaa0000', 'src/a.ts'), targetFor('aaaa0000', 'src/a.ts')),
      'два клика по одному файлу коммита дают одну цель — по ней дифф закрывается',
    ).toBe(true);
    expect(
      sameDiffTarget(targetFor('aaaa0000', 'src/a.ts'), targetFor('bbbb0000', 'src/a.ts')),
    ).toBe(false);
    expect(
      sameDiffTarget(targetFor('aaaa0000', 'src/a.ts'), targetFor('aaaa0000', 'src/b.ts')),
    ).toBe(false);
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
