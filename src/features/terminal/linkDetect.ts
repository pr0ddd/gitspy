export type TermLink = {
  kind: 'file' | 'hash';
  text: string;
  path?: string;
  line?: number;
};

export type TermLinkHit = { start: number; end: number; link: TermLink };

const PATH_LIKE = /(?:[\w.@~-]+\/)+[\w.@~-]+(?::(\d+))?(?::\d+)?/g;
const HEX_RUN = /\b[0-9a-f]{7,40}\b/g;
const TRAILING_POSITION = /(?::\d+)+$/;

const lastSegment = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const nameCarriesExtensionOrHome = (path: string): boolean =>
  lastSegment(path).includes('.') || path.startsWith('~');

const hexRunIsNotJustDigits = (text: string): boolean => /[a-f]/.test(text);

const overlapsAny = (start: number, end: number, taken: readonly TermLinkHit[]): boolean =>
  taken.some((hit) => start < hit.end && hit.start < end);

const fileHits = (line: string): TermLinkHit[] => {
  const hits: TermLinkHit[] = [];
  for (const match of line.matchAll(PATH_LIKE)) {
    const text = match[0];
    const path = text.replace(TRAILING_POSITION, '');
    if (!nameCarriesExtensionOrHome(path)) continue;
    const start = match.index;
    const at = match[1];
    hits.push({
      start,
      end: start + text.length,
      link: at ? { kind: 'file', text, path, line: Number(at) } : { kind: 'file', text, path },
    });
  }
  return hits;
};

const hashHits = (line: string, taken: readonly TermLinkHit[]): TermLinkHit[] => {
  const hits: TermLinkHit[] = [];
  for (const match of line.matchAll(HEX_RUN)) {
    const text = match[0];
    if (!hexRunIsNotJustDigits(text)) continue;
    const start = match.index;
    const end = start + text.length;
    if (overlapsAny(start, end, taken)) continue;
    hits.push({ start, end, link: { kind: 'hash', text } });
  }
  return hits;
};

export function detectLinks(line: string): TermLinkHit[] {
  const files = fileHits(line);
  return [...files, ...hashHits(line, files)].sort((a, b) => a.start - b.start);
}
