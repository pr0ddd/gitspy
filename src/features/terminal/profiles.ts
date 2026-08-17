import { readPref, writePref } from '@/shared/lib/prefs';

export type TermProfile = { label: string | null; command: string | null };

const PROFILES_KEY = 'term.profiles';

const loginShell = (): TermProfile[] => [{ label: null, command: null }];

export const readProfiles = (): TermProfile[] =>
  readPref<TermProfile[]>(PROFILES_KEY, loginShell());

export const writeProfiles = (next: TermProfile[]): void => writePref(PROFILES_KEY, next);
