export type DiffMode = 'hunk' | 'split' | 'inline';

export const DIFF_MODES: readonly DiffMode[] = ['hunk', 'split', 'inline'];

export const DIFF_MODE_LABEL: Record<DiffMode, string> = {
  hunk: 'Hunk view',
  split: 'Split view',
  inline: 'Inline view',
};

export type DiffOptions = {
  readonly renderSideBySide: boolean;
  readonly hideUnchangedRegions: { readonly enabled: boolean };
};

export const editorOptionsFor = (mode: DiffMode): DiffOptions => ({
  renderSideBySide: mode === 'split',
  hideUnchangedRegions: { enabled: mode === 'hunk' },
});
