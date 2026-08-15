import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as monaco from 'monaco-editor';
import { setModelWithZonesInOnePass, waitForDiffOrGiveUp } from './attach';

type Listener = () => void;

const fakeDiffEditor = () => {
  const events: string[] = [];
  const listeners = new Set<Listener>();
  let attached: monaco.editor.IDiffEditorModel | null = null;
  let attaching = false;
  const modified = {
    onDidChangeModel: (listener: Listener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    changeViewZones: (callback: (accessor: { addZone: (zone: unknown) => string }) => void) => {
      callback({
        addZone: () => {
          events.push(attaching ? 'zone-while-attaching' : 'zone-afterwards');
          return 'zone';
        },
      });
    },
  };
  const diffEditor = {
    getModifiedEditor: () => modified,
    getModel: () => attached,
    setModel: (next: monaco.editor.IDiffEditorViewModel | null) => {
      const model = next?.model ?? null;
      if (model === attached) return;
      attaching = true;
      events.push(model ? 'attach' : 'detach');
      attached = model;
      listeners.forEach((listener) => listener());
      attaching = false;
    },
  };
  return {
    editor: diffEditor as unknown as monaco.editor.IStandaloneDiffEditor,
    events,
    listenerCount: () => listeners.size,
  };
};

const viewModel = (): monaco.editor.IDiffEditorViewModel =>
  ({
    model: { original: {}, modified: {} },
    waitForDiff: () => Promise.resolve(),
    dispose: () => {},
  }) as unknown as monaco.editor.IDiffEditorViewModel;

const zone = { afterLineNumber: 3, heightInPx: 26, domNode: document.createElement('div') };

describe('подмена модели вместе с зонами', () => {
  it('зоны встают в правый редактор, пока модель прикрепляется — до того, как Monaco выровняет левую колонку', () => {
    const fake = fakeDiffEditor();
    setModelWithZonesInOnePass(fake.editor, viewModel(), [zone, zone]);
    expect(fake.events, 'обе зоны добавлены внутри setModel, а не после него').toEqual([
      'attach',
      'zone-while-attaching',
      'zone-while-attaching',
    ]);
  });

  it('уже прикреплённая модель сначала отцепляется: иначе прохода нет и зоны не встанут', () => {
    const fake = fakeDiffEditor();
    const vm = viewModel();
    setModelWithZonesInOnePass(fake.editor, vm, []);
    fake.events.length = 0;
    setModelWithZonesInOnePass(fake.editor, vm, [zone]);
    expect(fake.events, 'та же модель проходит через detach → attach с зоной внутри').toEqual([
      'detach',
      'attach',
      'zone-while-attaching',
    ]);
  });

  it('слушатель снимается после подмены: следующая смена модели зон не добавляет', () => {
    const fake = fakeDiffEditor();
    setModelWithZonesInOnePass(fake.editor, viewModel(), [zone]);
    expect(fake.listenerCount(), 'после подмены на редакторе не висит наш слушатель').toBe(0);
    fake.events.length = 0;
    fake.editor.setModel(viewModel());
    expect(fake.events, 'чужая подмена модели наших зон не получает').toEqual(['attach']);
  });
});

describe('ожидание сравнения', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('отпускает, как только дифф посчитан', async () => {
    let finish: () => void = () => {};
    const vm = {
      waitForDiff: () => new Promise<void>((resolve) => (finish = resolve)),
    } as unknown as monaco.editor.IDiffEditorViewModel;
    let released = false;
    void waitForDiffOrGiveUp(vm, 1000).then(() => (released = true));
    await vi.advanceTimersByTimeAsync(10);
    expect(released, 'до прихода диффа не отпускает').toBe(false);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(released, 'дифф пришёл — отпустило, не дожидаясь предела').toBe(true);
  });

  it('по истечении предела отпускает и без диффа: зависший воркер не должен вешать переключение файлов', async () => {
    const vm = {
      waitForDiff: () => new Promise<void>(() => {}),
    } as unknown as monaco.editor.IDiffEditorViewModel;
    let released = false;
    void waitForDiffOrGiveUp(vm, 1000).then(() => (released = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(released, 'предел вышел — показываем как есть').toBe(true);
  });
});
