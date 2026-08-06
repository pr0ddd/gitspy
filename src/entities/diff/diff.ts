export type DiffMode = 'hunk' | 'split' | 'inline';

export const DIFF_MODES: readonly DiffMode[] = ['hunk', 'split', 'inline'];


export type DiffOptions = {
  readonly renderSideBySide: boolean;
  readonly hideUnchangedRegions: { readonly enabled: boolean };
};

export const editorOptionsFor = (mode: DiffMode): DiffOptions => ({
  renderSideBySide: mode === 'split',
  hideUnchangedRegions: { enabled: mode === 'hunk' },
});
