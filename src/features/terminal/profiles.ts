import { readPref, writePref } from '@/prefs';

export type TermProfileKind = 'term' | 'acp';

export type TermProfile = { label: string; command: string | null; kind: TermProfileKind };

const PROFILES_KEY = 'term.profiles';

const loginShellAndAgent = (): TermProfile[] => [
  { label: 'zsh', command: null, kind: 'term' },
  { label: 'claude · ACP', command: null, kind: 'acp' },
];

const asTerminalUnlessSaidOtherwise = (profile: TermProfile): TermProfile => ({
  ...profile,
  kind: profile.kind === 'acp' ? 'acp' : 'term',
});

export const readProfiles = (): TermProfile[] =>
  readPref<TermProfile[]>(PROFILES_KEY, loginShellAndAgent()).map(asTerminalUnlessSaidOtherwise);

export const writeProfiles = (next: TermProfile[]): void => writePref(PROFILES_KEY, next);
