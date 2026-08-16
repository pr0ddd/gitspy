import { describe, expect, it } from 'vitest';
import { CodeEditorWidget } from 'monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget.js';

describe('Monaco internal API the hunk view relies on', () => {
  it('ICodeEditor still has setHiddenAreas: hunk mode folds unchanged lines through it', () => {
    expect(
      typeof CodeEditorWidget.prototype.setHiddenAreas,
      'setHiddenAreas is not part of the public typings; if a Monaco upgrade drops it, hunk mode dies at runtime — this guard fails first',
    ).toBe('function');
  });
});
