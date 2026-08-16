import { describe, expect, it } from 'vitest';
import { DIFF_MODES, editorOptionsFor } from './diff';

describe('diff view modes', () => {
  it('gives two columns to split and to nothing else', () => {
    expect(editorOptionsFor('split').renderSideBySide).toBe(true);
    expect(editorOptionsFor('inline').renderSideBySide).toBe(false);
    expect(
      editorOptionsFor('hunk').renderSideBySide,
      'hunk differs from inline by hiding the lines outside the hunks, not by editor options',
    ).toBe(false);
  });

  it('turns the overview ruler off in hunk view: everything left there is a change, so there is nothing to mark', () => {
    expect(editorOptionsFor('hunk').renderOverviewRuler).toBe(false);
    expect(editorOptionsFor('split').renderOverviewRuler).toBe(true);
    expect(editorOptionsFor('inline').renderOverviewRuler).toBe(true);
  });

  it('keeps the list of modes closed', () => {
    expect(DIFF_MODES).toEqual(['hunk', 'split', 'inline']);
  });
});
