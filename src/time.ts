const SPANS = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
] as const;

export function relativeTime(time: number, now: number, locale: string): string {
  const passed = Math.max(0, now - time);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, span] of SPANS) {
    if (passed >= span) return format.format(-Math.floor(passed / span), unit);
  }
  return format.format(0, 'second');
}
