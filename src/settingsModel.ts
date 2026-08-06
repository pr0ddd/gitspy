import type { AiProviderId } from '@/types';

export const SETTINGS = {
  autofetchMinutes: 'autofetch.minutes',
  rememberTabs: 'session.remember',
  pullDefault: 'toolbar.pull',
  initBranch: 'init.branch',
  editorFont: 'editor.font',
  editorFontSize: 'editor.fontSize',
  editorTabSize: 'editor.tabSize',
  editorSyntax: 'editor.syntax',
  editorLineNumbers: 'editor.lineNumbers',
  aiProvider: 'ai.provider',
  aiBaseUrl: 'ai.baseUrl',
  aiModel: 'ai.model',
} as const;

export const AI_DEFAULT_URLS: Record<AiProviderId, string> = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234',
};

export const AI_PROVIDERS: ReadonlyArray<{ key: AiProviderId; label: string }> = [
  { key: 'ollama', label: 'settings.aiOllama' },
  { key: 'lmstudio', label: 'settings.aiLmStudio' },
];

export const AUTOFETCH_LIMITS = { min: 0, max: 60, fallback: 1 } as const;

export function clampAutofetch(minutes: number): number {
  if (Number.isNaN(minutes)) return AUTOFETCH_LIMITS.fallback;
  return Math.min(AUTOFETCH_LIMITS.max, Math.max(AUTOFETCH_LIMITS.min, Math.round(minutes)));
}

export const FONT_SIZE_LIMITS = { min: 9, max: 24, fallback: 13 } as const;
export const TAB_SIZE_LIMITS = { min: 1, max: 8, fallback: 4 } as const;

const clampWhole = (
  value: number,
  limits: { min: number; max: number; fallback: number },
): number => {
  if (Number.isNaN(value)) return limits.fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
};

export const clampFontSize = (size: number): number => clampWhole(size, FONT_SIZE_LIMITS);
export const clampTabSize = (size: number): number => clampWhole(size, TAB_SIZE_LIMITS);

export const MONO_CANDIDATES = [
  'Geist Mono Variable',
  'Menlo',
  'Monaco',
  'SF Mono',
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'Source Code Pro',
  'IBM Plex Mono',
  'Hack',
  'Consolas',
  'Ubuntu Mono',
] as const;

export function monospaceChoices(installed: (family: string) => boolean): string[] {
  return MONO_CANDIDATES.filter((family) => installed(family));
}
