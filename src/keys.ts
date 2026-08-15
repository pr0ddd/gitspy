import { KEYS } from '@/vocabulary';

export type Chord = {
  key: string;
  primary?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export type Stroke = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export const applePlatform = (agent: string): boolean => /Mac|iPhone|iPad/i.test(agent);

export const onApple = (): boolean =>
  typeof navigator === 'undefined' ? false : applePlatform(navigator.userAgent);

const shiftIsPartOfSymbol = (key: string): boolean => key.length === 1 && !/[a-z0-9]/i.test(key);

export function matchesChord(chord: Chord, stroke: Stroke, apple: boolean): boolean {
  if (chord.key.toLowerCase() !== stroke.key.toLowerCase()) return false;

  const primary = apple ? stroke.metaKey : stroke.ctrlKey;
  const foreign = apple ? stroke.ctrlKey : stroke.metaKey;
  if (foreign) return false;
  if (primary !== (chord.primary === true)) return false;
  if (stroke.altKey !== (chord.alt === true)) return false;
  if (!shiftIsPartOfSymbol(chord.key) && stroke.shiftKey !== (chord.shift === true)) return false;

  return true;
}

const NAMED: Record<string, (apple: boolean) => string> = {
  arrowup: () => KEYS.up,
  arrowdown: () => KEYS.down,
  arrowleft: () => KEYS.left,
  arrowright: () => KEYS.right,
  enter: (apple) => (apple ? KEYS.enterSign : KEYS.enterWord),
  escape: () => KEYS.escape,
  home: () => KEYS.home,
  end: () => KEYS.end,
  tab: () => KEYS.tab,
  ' ': () => KEYS.space,
};

export const keyLabel = (key: string, apple: boolean): string =>
  NAMED[key.toLowerCase()]?.(apple) ?? (key.length === 1 ? key.toUpperCase() : key);

export function chordKeys(chord: Chord, apple: boolean): string[] {
  const parts: string[] = [];
  if (chord.primary) parts.push(apple ? KEYS.command : KEYS.ctrl);
  if (chord.shift) parts.push(apple ? KEYS.shiftSign : KEYS.shiftWord);
  if (chord.alt) parts.push(apple ? KEYS.altSign : KEYS.altWord);
  parts.push(keyLabel(chord.key, apple));
  return parts;
}

export const chordLabel = (chord: Chord, apple: boolean): string =>
  chordKeys(chord, apple).join(apple ? ' ' : ' + ');
