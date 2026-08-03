import { describe, expect, it } from 'vitest';
import { DIFF_MODES, editorOptionsFor } from './diff';

describe('режимы просмотра диффа', () => {
  it('две колонки бывают только у split', () => {
    expect(editorOptionsFor('split').renderSideBySide).toBe(true);
    expect(editorOptionsFor('inline').renderSideBySide).toBe(false);
    expect(editorOptionsFor('hunk').renderSideBySide).toBe(false);
  });

  it('hunk прячет неизменённое, остальные показывают файл целиком', () => {
    expect(editorOptionsFor('hunk').hideUnchangedRegions.enabled).toBe(true);
    expect(editorOptionsFor('split').hideUnchangedRegions.enabled).toBe(false);
    expect(editorOptionsFor('inline').hideUnchangedRegions.enabled).toBe(false);
  });

  it('каждый режим отличается от остальных хотя бы одной опцией', () => {
    const shown = DIFF_MODES.map((mode) => JSON.stringify(editorOptionsFor(mode)));
    expect(new Set(shown).size).toBe(DIFF_MODES.length);
  });
});
