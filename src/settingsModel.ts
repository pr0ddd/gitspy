export const SETTINGS = {
  autofetchMinutes: 'autofetch.minutes',
  rememberTabs: 'session.remember',
  pullDefault: 'toolbar.pull',
  initBranch: 'init.branch',
} as const;

export const AUTOFETCH_LIMITS = { min: 0, max: 60, fallback: 1 } as const;

export function clampAutofetch(minutes: number): number {
  if (Number.isNaN(minutes)) return AUTOFETCH_LIMITS.fallback;
  return Math.min(AUTOFETCH_LIMITS.max, Math.max(AUTOFETCH_LIMITS.min, Math.round(minutes)));
}
