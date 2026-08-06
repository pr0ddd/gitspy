import { describe, expect, it } from 'vitest';
import { DIFF_MODES, editorOptionsFor } from './diff';

describe('режимы просмотра диффа', () => {
  it('две колонки бывают только у split', () => {
    expect(editorOptionsFor('split').renderSideBySide).toBe(true);
    expect(editorOptionsFor('inline').renderSideBySide).toBe(false);
    expect(
      editorOptionsFor('hunk').renderSideBySide,
      'hunk отличается от inline не опциями редактора, а скрытием строк вне ханков',
    ).toBe(false);
  });

  it('список режимов закрыт', () => {
    expect(DIFF_MODES).toEqual(['hunk', 'split', 'inline']);
  });
});
