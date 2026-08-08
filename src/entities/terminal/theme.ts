import type { ITheme } from '@xterm/xterm';

const TERM_TOKENS: Record<string, string> = {
  background: '--card',
  foreground: '--foreground',
  cursor: '--foreground',
  selectionBackground: '--term-selection',
  black: '--term-ansi-0',
  red: '--term-ansi-1',
  green: '--term-ansi-2',
  yellow: '--term-ansi-3',
  blue: '--term-ansi-4',
  magenta: '--term-ansi-5',
  cyan: '--term-ansi-6',
  white: '--term-ansi-7',
  brightBlack: '--term-ansi-8',
  brightRed: '--term-ansi-9',
  brightGreen: '--term-ansi-10',
  brightYellow: '--term-ansi-11',
  brightBlue: '--term-ansi-12',
  brightMagenta: '--term-ansi-13',
  brightCyan: '--term-ansi-14',
  brightWhite: '--term-ansi-15',
};

export const readTermTheme = (read: (name: string) => string): ITheme =>
  Object.fromEntries(
    Object.entries(TERM_TOKENS).map(([slot, token]) => [slot, read(token)]),
  ) as ITheme;

export const readTermThemeFromDom = (): ITheme => {
  const style = getComputedStyle(document.documentElement);
  return readTermTheme((name) => style.getPropertyValue(name).trim());
};
