export type DiffMode = 'hunk' | 'split' | 'inline';

export const DIFF_MODES: readonly DiffMode[] = ['hunk', 'split', 'inline'];

export type DiffOptions = {
  readonly renderSideBySide: boolean;
  readonly renderOverviewRuler: boolean;
};

export const editorOptionsFor = (mode: DiffMode): DiffOptions => ({
  renderSideBySide: mode === 'split',
  renderOverviewRuler: mode !== 'hunk',
});
