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

describe('swapping the model together with the zones', () => {
  it('adds the zones to the modified editor while the model is attaching, before Monaco aligns the left column', () => {
    const fake = fakeDiffEditor();
    setModelWithZonesInOnePass(fake.editor, viewModel(), [zone, zone]);
    expect(fake.events, 'both zones are added inside setModel, not after it returns').toEqual([
      'attach',
      'zone-while-attaching',
      'zone-while-attaching',
    ]);
  });

  it('detaches an already attached model first: without that there is no pass to add the zones in', () => {
    const fake = fakeDiffEditor();
    const vm = viewModel();
    setModelWithZonesInOnePass(fake.editor, vm, []);
    fake.events.length = 0;
    setModelWithZonesInOnePass(fake.editor, vm, [zone]);
    expect(
      fake.events,
      'the same model goes through detach then attach with the zone inside',
    ).toEqual(['detach', 'attach', 'zone-while-attaching']);
  });

  it('drops the listener after the swap: the next model change adds no zones', () => {
    const fake = fakeDiffEditor();
    setModelWithZonesInOnePass(fake.editor, viewModel(), [zone]);
    expect(fake.listenerCount(), 'after the swap our listener is no longer on the editor').toBe(0);
    fake.events.length = 0;
    fake.editor.setModel(viewModel());
    expect(fake.events, 'a model swap made by someone else gets none of our zones').toEqual([
      'attach',
    ]);
  });
});

describe('waiting for the diff to be computed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('releases as soon as the diff is computed', async () => {
    let finish: () => void = () => {};
    const vm = {
      waitForDiff: () => new Promise<void>((resolve) => (finish = resolve)),
    } as unknown as monaco.editor.IDiffEditorViewModel;
    let released = false;
    void waitForDiffOrGiveUp(vm, 1000).then(() => (released = true));
    await vi.advanceTimersByTimeAsync(10);
    expect(released, 'it holds until the diff arrives').toBe(false);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(released, 'the diff arrived, so it releases without waiting out the timeout').toBe(true);
  });

  it('releases on timeout even without a diff: a stuck worker must not freeze switching between files', async () => {
    const vm = {
      waitForDiff: () => new Promise<void>(() => {}),
    } as unknown as monaco.editor.IDiffEditorViewModel;
    let released = false;
    void waitForDiffOrGiveUp(vm, 1000).then(() => (released = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(released, 'the timeout has run out, so we show the file as it is').toBe(true);
  });
});
