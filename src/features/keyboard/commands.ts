import { matchesChord, type Chord, type Stroke } from '@/keys';

export type Area = 'files' | 'refs' | 'graph' | 'text';

export type CommandGroup = 'repo' | 'navigation' | 'ui';

export type CommandId =
  | 'commit'
  | 'stageCurrent'
  | 'unstageCurrent'
  | 'stageAll'
  | 'unstageAll'
  | 'fetch'
  | 'createBranch'
  | 'selectPrevious'
  | 'selectNext'
  | 'selectFirst'
  | 'selectLast'
  | 'openSelected'
  | 'closeView'
  | 'toggleSidebar'
  | 'toggleTerminal'
  | 'searchCommits'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'closeTab'
  | 'shortcuts';

export type Command = {
  id: CommandId;
  label: string;
  group: CommandGroup;
  chords: Chord[];
  area?: Exclude<Area, 'text'>;
};

export const COMMANDS: readonly Command[] = [
  {
    id: 'commit',
    label: 'shortcuts.commit',
    group: 'repo',
    chords: [{ key: 'Enter', primary: true }],
  },
  {
    id: 'stageCurrent',
    label: 'shortcuts.stageCurrent',
    group: 'repo',
    area: 'files',
    chords: [{ key: 's' }],
  },
  {
    id: 'unstageCurrent',
    label: 'shortcuts.unstageCurrent',
    group: 'repo',
    area: 'files',
    chords: [{ key: 'u' }],
  },
  {
    id: 'stageAll',
    label: 'shortcuts.stageAll',
    group: 'repo',
    chords: [{ key: 's', primary: true, shift: true }],
  },
  {
    id: 'unstageAll',
    label: 'shortcuts.unstageAll',
    group: 'repo',
    chords: [{ key: 'u', primary: true, shift: true }],
  },
  { id: 'fetch', label: 'shortcuts.fetch', group: 'repo', chords: [{ key: 'l', primary: true }] },
  {
    id: 'createBranch',
    label: 'shortcuts.createBranch',
    group: 'repo',
    chords: [{ key: 'b', primary: true }],
  },
  {
    id: 'selectPrevious',
    label: 'shortcuts.selectPrevious',
    group: 'navigation',
    chords: [{ key: 'ArrowUp' }, { key: 'k' }],
  },
  {
    id: 'selectNext',
    label: 'shortcuts.selectNext',
    group: 'navigation',
    chords: [{ key: 'ArrowDown' }, { key: 'j' }],
  },
  {
    id: 'selectFirst',
    label: 'shortcuts.selectFirst',
    group: 'navigation',
    chords: [{ key: 'Home' }],
  },
  {
    id: 'selectLast',
    label: 'shortcuts.selectLast',
    group: 'navigation',
    chords: [{ key: 'End' }],
  },
  {
    id: 'openSelected',
    label: 'shortcuts.openSelected',
    group: 'navigation',
    chords: [{ key: 'ArrowRight' }, { key: 'Enter' }],
  },
  {
    id: 'closeView',
    label: 'shortcuts.closeView',
    group: 'navigation',
    chords: [{ key: 'Escape' }, { key: 'ArrowLeft' }],
  },
  {
    id: 'toggleSidebar',
    label: 'shortcuts.toggleSidebar',
    group: 'ui',
    chords: [{ key: '\\', primary: true }],
  },
  {
    id: 'toggleTerminal',
    label: 'shortcuts.toggleTerminal',
    group: 'ui',
    chords: [{ key: '`', primary: true }],
  },
  {
    id: 'searchCommits',
    label: 'shortcuts.searchCommits',
    group: 'ui',
    chords: [{ key: 'f', primary: true }],
  },
  {
    id: 'zoomIn',
    label: 'shortcuts.zoomIn',
    group: 'ui',
    chords: [
      { key: '=', primary: true },
      { key: '+', primary: true },
    ],
  },
  {
    id: 'zoomOut',
    label: 'shortcuts.zoomOut',
    group: 'ui',
    chords: [
      { key: '-', primary: true },
      { key: '_', primary: true },
    ],
  },
  {
    id: 'zoomReset',
    label: 'shortcuts.zoomReset',
    group: 'ui',
    chords: [{ key: '0', primary: true }],
  },
  {
    id: 'closeTab',
    label: 'shortcuts.closeTab',
    group: 'ui',
    chords: [{ key: 'w', primary: true }],
  },
  {
    id: 'shortcuts',
    label: 'shortcuts.shortcuts',
    group: 'ui',
    chords: [{ key: '/', primary: true }],
  },
];

const reachable = (chord: Chord, command: Command, area: Area | null): boolean => {
  if (area === 'text') return chord.primary === true;
  if (command.area === undefined) return true;
  return command.area === area;
};

export function commandFor(stroke: Stroke, area: Area | null, apple: boolean): Command | null {
  const hit = COMMANDS.filter((command) =>
    command.chords.some(
      (chord) => reachable(chord, command, area) && matchesChord(chord, stroke, apple),
    ),
  );
  return hit.find((command) => command.area !== undefined) ?? hit[0] ?? null;
}
