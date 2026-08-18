import {
  monaco,
  type ConflictBlock,
  type ConflictSide,
  type OutputLayout,
  type PaneLayout,
  type Picks,
} from '@/entities/diff';

export const SIDE_LINE: Record<ConflictSide | 'base', string> = {
  a: 'conflict-line-a',
  b: 'conflict-line-b',
  base: 'conflict-line-base',
};

export const SIDE_MARGIN: Record<ConflictSide | 'base', string> = {
  a: 'conflict-margin-a',
  b: 'conflict-margin-b',
  base: 'conflict-margin-base',
};

export const markClass = (taken: boolean, hovered: boolean): string | undefined =>
  hovered
    ? taken
      ? 'gutter-mark-remove'
      : 'gutter-mark-add'
    : taken
      ? 'gutter-mark-taken'
      : undefined;

export function sideDecorations(
  blocks: readonly ConflictBlock[],
  side: ConflictSide,
  pane: PaneLayout,
  picks: Picks,
  hoveredLine: number | null,
): monaco.editor.IModelDeltaDecoration[] {
  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  for (const place of pane.places) {
    const block = blocks[place.at];
    if (block?.kind !== 'conflict') continue;
    const chosen = picks[place.at]?.[side] ?? new Set<number>();
    for (let line = place.from; line <= place.to; line++) {
      const index = line - place.from;
      decorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: SIDE_LINE[side],
          marginClassName: SIDE_MARGIN[side],
          linesDecorationsClassName: markClass(chosen.has(index), hoveredLine === line),
        },
      });
    }
  }
  return decorations;
}

export function outputDecorations(
  out: OutputLayout,
  hoveredLine: number | null,
): monaco.editor.IModelDeltaDecoration[] {
  return out.origins.map((origin) => ({
    range: new monaco.Range(origin.line, 1, origin.line, 1),
    options: {
      isWholeLine: true,
      className: SIDE_LINE[origin.side],
      marginClassName: SIDE_MARGIN[origin.side],
      linesDecorationsClassName:
        origin.side === 'base' ? undefined : markClass(true, hoveredLine === origin.line),
    },
  }));
}

export function boxCentres(
  editor: monaco.editor.IStandaloneCodeEditor,
  pane: PaneLayout,
): Array<{ at: number; centre: number }> {
  const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
  const scrollTop = editor.getScrollTop();
  return pane.places.map((place) => {
    const top = editor.getTopForLineNumber(Math.max(1, place.from));
    const height = Math.max(1, place.to - place.from + 1) * lineHeight;
    return { at: place.at, centre: top + height / 2 - scrollTop };
  });
}
