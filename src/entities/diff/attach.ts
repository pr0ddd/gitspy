import type * as monaco from 'monaco-editor';

export function setModelWithZonesInOnePass(
  diffEditor: monaco.editor.IStandaloneDiffEditor,
  viewModel: monaco.editor.IDiffEditorViewModel,
  zones: readonly monaco.editor.IViewZone[],
): void {
  if (diffEditor.getModel()?.modified === viewModel.model.modified) {
    diffEditor.setModel(null);
  }
  const modified = diffEditor.getModifiedEditor();
  const attaching = modified.onDidChangeModel(() => {
    modified.changeViewZones((accessor) => zones.forEach((zone) => accessor.addZone(zone)));
  });
  try {
    diffEditor.setModel(viewModel);
  } finally {
    attaching.dispose();
  }
}

export const waitForDiffOrGiveUp = (
  viewModel: monaco.editor.IDiffEditorViewModel,
  limitMs: number,
): Promise<void> =>
  new Promise((resolve) => {
    const limit = setTimeout(resolve, limitMs);
    const release = () => {
      clearTimeout(limit);
      resolve();
    };
    viewModel.waitForDiff().then(release, release);
  });
