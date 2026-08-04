export type ColumnKey = 'branchTag' | 'graph' | 'author' | 'date' | 'sha';

export type StoredWidths = Partial<Record<ColumnKey, number>>;

export type Band = {
  readonly left: number;
  readonly width: number;
};

export type Cols = {
  readonly branchTag: Band;
  readonly graph: Band;
  readonly message: Band;
  readonly author: Band;
  readonly date: Band;
  readonly sha: Band;
  readonly listW: number;
};

export const FLOORS: Record<ColumnKey, number> = {
  branchTag: 44,
  graph: 26,
  author: 80,
  date: 88,
  sha: 72,
};

export const MESSAGE_FLOOR = 160;

const MESSAGE_COMFORT = 312;
const GRAPH_DEFAULT_MIN = 140;
const GRAPH_DEFAULT_MAX = 760;

const SQUEEZE_ORDER: ColumnKey[] = ['graph', 'sha', 'date', 'author', 'branchTag'];

export const defaultWidths = (listW: number): Record<ColumnKey, number> => {
  const branchTag = 210;
  const author = 140;
  const date = 88;
  const sha = 80;
  const rest = listW - branchTag - author - date - sha - MESSAGE_COMFORT;
  const graph = Math.max(GRAPH_DEFAULT_MIN, Math.min(GRAPH_DEFAULT_MAX, rest));
  return { branchTag, graph, author, date, sha };
};

export function layoutColumns(listW: number, stored: StoredWidths): Cols {
  const wanted = { ...defaultWidths(listW), ...stored };
  const width: Record<ColumnKey, number> = {
    branchTag: Math.max(FLOORS.branchTag, wanted.branchTag),
    graph: Math.max(FLOORS.graph, wanted.graph),
    author: Math.max(FLOORS.author, wanted.author),
    date: Math.max(FLOORS.date, wanted.date),
    sha: Math.max(FLOORS.sha, wanted.sha),
  };

  const spent = () => width.branchTag + width.graph + width.author + width.date + width.sha;

  let message = listW - spent();
  if (message < MESSAGE_FLOOR) {
    let deficit = MESSAGE_FLOOR - message;
    for (const key of SQUEEZE_ORDER) {
      if (deficit <= 0) break;
      const give = Math.min(deficit, width[key] - FLOORS[key]);
      width[key] -= give;
      deficit -= give;
    }
    message = Math.max(0, listW - spent());
  }

  const branchTag = { left: 0, width: width.branchTag };
  const graph = { left: branchTag.width, width: width.graph };
  const messageBand = { left: graph.left + graph.width, width: message };
  const author = { left: messageBand.left + message, width: width.author };
  const date = { left: author.left + author.width, width: width.date };
  const sha = { left: date.left + date.width, width: width.sha };

  return { branchTag, graph, message: messageBand, author, date, sha, listW };
}

export type Divider = {
  readonly x: number;
  readonly take: ColumnKey | null;
  readonly give: ColumnKey | null;
};

export const dividers = (cols: Cols): Divider[] => [
  { x: cols.branchTag.left + cols.branchTag.width, take: 'branchTag', give: 'graph' },
  { x: cols.graph.left + cols.graph.width, take: 'graph', give: null },
  { x: cols.author.left, take: null, give: 'author' },
  { x: cols.date.left, take: 'author', give: 'date' },
  { x: cols.sha.left, take: 'date', give: 'sha' },
];

const GRIP = 4;

export const dividerAt = (x: number, cols: Cols): Divider | null =>
  dividers(cols).find((divider) => Math.abs(divider.x - x) <= GRIP) ?? null;

const slack = (cols: Cols, side: ColumnKey | null): number =>
  side === null
    ? Math.max(0, cols.message.width - MESSAGE_FLOOR)
    : Math.max(0, cols[side].width - FLOORS[side]);

export function resized(
  stored: StoredWidths,
  cols: Cols,
  divider: Divider,
  dx: number,
): StoredWidths {
  const given = Math.round(
    Math.min(slack(cols, divider.give), Math.max(-slack(cols, divider.take), dx)),
  );

  const out = { ...stored };
  if (divider.take) out[divider.take] = cols[divider.take].width + given;
  if (divider.give) out[divider.give] = cols[divider.give].width - given;
  return out;
}

export const reset = (stored: StoredWidths, key: ColumnKey): StoredWidths => {
  const { [key]: _dropped, ...rest } = stored;
  return rest;
};

const STORE_KEY = 'gitspy.columns.v2';

const sane = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 4000;

export function loadWidths(): StoredWidths {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const found: StoredWidths = {};
    for (const key of Object.keys(FLOORS) as ColumnKey[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (sane(value)) found[key] = value;
    }
    return found;
  } catch {
    return {};
  }
}

export function saveWidths(stored: StoredWidths): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(stored));
  } catch {
    return;
  }
}
