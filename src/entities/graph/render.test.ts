import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  drawFrame,
  METRICS_AVATARS,
  METRICS_COMPACT,
  rowIsDimmed,
  type Frame,
  type HoverChip,
} from './index';
import { FLOORS, layoutColumns } from './columns';
import { GRAPH_INSET, listWidth, rowBandHeight } from './scene';
import { RowCache } from './rows';
import type { AvatarCache } from '@/shared/ui/avatarCache';
import { GLYPH } from './glyphs';
import type { RefKind, RefView, RepoView, WindowView } from '@/shared/api/types';

vi.mock('@/shared/ui/theme', async (original) => ({
  ...(await original<object>()),
  laneColourAlpha: (index: number, percent: number) => `lane${index}@${percent}`,
}));

class RecordedPath {
  d: string | undefined;
  ops: { op: string; x: number; y: number }[] = [];
  constructor(d?: string) {
    this.d = d;
  }
  moveTo(x: number, y: number) {
    this.ops.push({ op: 'moveTo', x, y });
  }
  lineTo(x: number, y: number) {
    this.ops.push({ op: 'lineTo', x, y });
  }
  arcTo() {}
}

beforeAll(() => {
  vi.stubGlobal('Path2D', RecordedPath);
});

const calls: string[] = [];
const texts: string[] = [];
const placedTexts: { text: string; x: number; y: number }[] = [];
const strokedGlyphs: { d: string; x: number }[] = [];
const drawnImages: { image: unknown; x: number }[] = [];
const filledRects: { x: number; y: number; w: number; h: number; style: string; alpha: number }[] =
  [];
const strokedPaths: { op: string; x: number; y: number }[][] = [];
const arcs: { x: number; y: number; r: number }[] = [];
const corners: number[] = [];
type TracedFill = { style: string; xs: number[]; ys: number[] };
const tracedFills: TracedFill[] = [];
const tracedStrokes: { xs: number[]; ys: number[] }[] = [];
let tracing: { xs: number[]; ys: number[] } = { xs: [], ys: [] };
let lastTranslateX = 0;

let measureText = (_text: string) => ({ width: 40 });

const context = () =>
  new Proxy(
    {
      canvas: { width: 0, height: 0 },
      measureText: (text: string) => measureText(text),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      getContext: () => null,
      translate: (x: number) => {
        calls.push('translate');
        lastTranslateX = x;
      },
      stroke: (path?: RecordedPath) => {
        calls.push('stroke');
        if (path?.d) strokedGlyphs.push({ d: path.d, x: lastTranslateX });
        if (path?.ops.length) strokedPaths.push(path.ops);
        if (!path && tracing.xs.length > 0) tracedStrokes.push({ xs: tracing.xs, ys: tracing.ys });
      },
    } as Record<string, unknown>,
    {
      get(target, key: string) {
        if (key in target) return target[key];
        return (...args: unknown[]) => {
          calls.push(key);
          if (key === 'fillText' && typeof args[0] === 'string') {
            texts.push(args[0]);
            placedTexts.push({ text: args[0], x: Number(args[1]), y: Number(args[2]) });
          }
          if (key === 'drawImage') {
            drawnImages.push({ image: args[0], x: Number(args[1]) });
          }
          if (key === 'fillRect') {
            filledRects.push({
              x: Number(args[0]),
              y: Number(args[1]),
              w: Number(args[2]),
              h: Number(args[3]),
              style: String(target.fillStyle ?? ''),
              alpha: Number(target.globalAlpha ?? 1),
            });
          }
          if (key === 'arc') {
            arcs.push({ x: Number(args[0]), y: Number(args[1]), r: Number(args[2]) });
          }
          if (key === 'arcTo') {
            corners.push(Number(args[4]));
            tracing.xs.push(Number(args[0]), Number(args[2]));
            tracing.ys.push(Number(args[1]), Number(args[3]));
          }
          if (key === 'beginPath') tracing = { xs: [], ys: [] };
          if (key === 'moveTo' || key === 'lineTo') {
            tracing.xs.push(Number(args[0]));
            tracing.ys.push(Number(args[1]));
          }
          if (key === 'rect') {
            tracing.xs.push(Number(args[0]), Number(args[0]) + Number(args[2]));
            tracing.ys.push(Number(args[1]), Number(args[1]) + Number(args[3]));
          }
          if (key === 'fill' && tracing.xs.length > 0) {
            tracedFills.push({
              style: String(target.fillStyle ?? ''),
              xs: tracing.xs,
              ys: tracing.ys,
            });
          }
        };
      },
      set(target, key: string, value: unknown) {
        target[key] = value;
        return true;
      },
    },
  );

const canvas = () =>
  ({
    width: 0,
    height: 0,
    getContext: () => context(),
  }) as unknown as HTMLCanvasElement;

const ref = (name: string, kind: RefKind, patch: Partial<RefView> = {}): RefView => ({
  name,
  kind,
  commit: 0,
  oid: 'refoid',
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
  ...patch,
});

const repo = (refs: RefView[]): RepoView => ({
  path: '/repo',
  count: 3,
  maxLane: 1,
  head: 0,
  truncated: false,
  readMs: 0,
  layoutMs: 0,
  minimap: [0, 0, 0],
  minimapColours: [1, 2, 3],
  remotes: [
    {
      name: 'origin',
      avatarUrl: 'https://github.com/facebook.png',
      webUrl: 'https://github.com/facebook/react',
    },
  ],
  refs,
});

const window_ = (): WindowView => ({
  start: 0,
  rows: [0, 1, 2].map((index) => ({
    kind: 'commit' as const,
    index,
    lane: 0,
    colour: 0,
    node: 0,
    owner: 0,
    hash: `${index}`.repeat(7),
    author: 'pr0d',
    email: 'p@example.com',
    time: 0,
    committer: 'pr0d',
    committerEmail: 'p@example.com',
    committerTime: 0,
    subject: 'subject',
    body: 'body first line\nrest',
  })),
  segOffsets: [0, 0, 0, 0],
  segKind: [],
  segFrom: [],
  segTo: [],
  segColour: [],
});

type WipOver = { conflicts: number; inProgress: string | null };

const withWorkingTreeRow = (window: WindowView, over?: WipOver): WindowView => ({
  ...window,
  rows: [
    {
      kind: 'workingTree' as const,
      index: 0,
      lane: 0,
      colour: 0,
      node: 0,
      owner: null,
      added: 7,
      modified: 29,
      deleted: 3,
      conflicts: 0,
      inProgress: null,
      ...over,
    },
    ...window.rows.slice(1),
  ],
});

const readyAvatars = (key: string, image: unknown): AvatarCache =>
  ({
    lookOf: (asked: string) =>
      asked === key ? { kind: 'image' as const, image } : { kind: 'identicon' as const },
  }) as AvatarCache;

const frameWith = (
  refs: RefView[],
  avatars: AvatarCache | null = null,
  pullHeads: ReadonlySet<string> = new Set(),
  hoverChip: HoverChip | null = null,
  workingTree: boolean | WipOver = false,
): Frame => {
  const rows = new RowCache();
  rows.put(
    0,
    workingTree
      ? withWorkingTreeRow(window_(), workingTree === true ? undefined : workingTree)
      : window_(),
  );
  const byCommit = new Map<number, RefView[]>();
  if (refs.length) byCommit.set(0, refs);

  return {
    repo: repo(refs),
    rows,
    pullHeads,
    hoverChip,
    veil: null,
    columns: {
      branchTag: 'branch / tag',
      graph: 'graph',
      message: 'message',
      author: 'author',
      date: 'date',
      sha: 'sha',
      workingTree: 'working tree',
      inProgress: 'merge in progress',
      mergeConflicts: 'two conflicts block the merge into main',
    },
    cols: layoutColumns(1200, {}),
    avatars,
    refsByCommit: byCommit,
    minimap: null,
    metrics: METRICS_AVATARS,
    scrollY: 0,
    scrollX: 0,
    hover: null,
    selected: 0,
    width: 1200,
    height: 600,
  };
};

const paint = (
  refs: RefView[],
  avatars: AvatarCache | null = null,
  pullHeads: ReadonlySet<string> = new Set(),
  hoverChip: HoverChip | null = null,
  workingTree: boolean | WipOver = false,
) => {
  calls.length = 0;
  texts.length = 0;
  placedTexts.length = 0;
  strokedGlyphs.length = 0;
  drawnImages.length = 0;
  filledRects.length = 0;
  arcs.length = 0;
  corners.length = 0;
  tracedFills.length = 0;
  tracedStrokes.length = 0;
  strokedPaths.length = 0;
  drawFrame(canvas(), frameWith(refs, avatars, pullHeads, hoverChip, workingTree));
  return {
    calls,
    texts,
    placedTexts,
    strokedGlyphs,
    drawnImages,
    filledRects,
    arcs,
    strokedPaths,
    tracedFills,
    tracedStrokes,
  };
};

const bandFills = (fills: readonly TracedFill[]) =>
  fills
    .map((f) => ({
      style: f.style,
      left: Math.min(...f.xs),
      right: Math.max(...f.xs),
      height: Math.max(...f.ys) - Math.min(...f.ys),
    }))
    .filter((f) => f.right - f.left > 100);

const paintWithHidden = (hidden: ReadonlySet<'author' | 'date' | 'sha'>) => {
  texts.length = 0;
  placedTexts.length = 0;
  strokedGlyphs.length = 0;
  const frame = frameWith([]);
  drawFrame(canvas(), { ...frame, cols: layoutColumns(1200, {}, hidden) });
  return { texts: [...texts], placedTexts: [...placedTexts], strokedGlyphs: [...strokedGlyphs] };
};

describe('the column headings', () => {
  it('turn into glyphs at their floors while the wide columns keep their words', () => {
    texts.length = 0;
    strokedGlyphs.length = 0;
    const frame = frameWith([]);
    drawFrame(canvas(), {
      ...frame,
      cols: layoutColumns(1200, {
        branchTag: FLOORS.branchTag,
        author: FLOORS.author,
        date: FLOORS.date,
        sha: FLOORS.sha,
      }),
    });
    expect(
      texts.some((text) => text.startsWith('BRANCH') || text.startsWith('AUTH')),
      'no truncated word anywhere',
    ).toBe(false);
    for (const glyph of [GLYPH.branchTag, GLYPH.author, GLYPH.date, GLYPH.sha]) {
      expect(strokedGlyphs.some((g) => g.d === glyph.d)).toBe(true);
    }
    expect(texts, 'the message column is wide and keeps its word').toContain('MESSAGE');
  });

  it('the branch column glyph stands over the badge: it slides with it below 49 and holds still above', () => {
    const glyphAt = (branchTag: number) => {
      strokedGlyphs.length = 0;
      drawFrame(canvas(), { ...frameWith([]), cols: layoutColumns(1200, { branchTag }) });
      return strokedGlyphs.find((g) => g.d === GLYPH.branchTag.d)!.x;
    };

    expect(glyphAt(49) - glyphAt(44), 'five more pixels of column move the glyph by 2.5').toBe(2.5);
    expect(glyphAt(55), 'above 49 the badge does not move, nor does the glyph').toBe(glyphAt(49));
  });

  it('turns into the graph glyph when the word no longer fits the column', () => {
    const roomy = paintWithHidden(new Set());
    expect(roomy.texts).toContain('GRAPH');
    expect(roomy.strokedGlyphs.some((g) => g.d === GLYPH.graph.d)).toBe(false);

    texts.length = 0;
    strokedGlyphs.length = 0;
    const frame = frameWith([]);
    drawFrame(canvas(), { ...frame, cols: layoutColumns(1200, { graph: FLOORS.graph }) });
    expect(
      texts.some((text) => text.startsWith('GR')),
      'no truncated word',
    ).toBe(false);
    expect(
      strokedGlyphs.some((g) => g.d === GLYPH.graph.d),
      'the glyph stands in for the heading',
    ).toBe(true);
  });
});

describe('the selected row', () => {
  it('carries a stronger tint of its lane colour than its neighbours, and no ring around the node', () => {
    arcs.length = 0;
    filledRects.length = 0;
    tracedFills.length = 0;
    const frame = frameWith([]);
    drawFrame(canvas(), { ...frame, selected: 1, hover: null });

    const bands = tracedFills.filter((r) => r.style.startsWith('lane'));
    const percents = bands.map((r) => Number(r.style.split('@')[1]));
    expect(Math.max(...percents), 'the selected band is the brightest').toBe(50);
    expect(percents.filter((p) => p === 50).length, 'exactly one row is selected').toBe(1);
    expect(percents.filter((p) => p === 11).length, 'the rest keep the quiet tint').toBeGreaterThan(
      1,
    );
    const nodeR = METRICS_AVATARS.nodeR;
    expect(
      arcs.some((a) => Math.abs(a.r - (nodeR + 3.5)) < 0.01),
      'no extra ring is drawn around the selected node',
    ).toBe(false);
  });
});

describe('hidden columns', () => {
  it('draws neither the date nor its heading when the column is off, so nothing lands on the SHA', () => {
    const shown = paintWithHidden(new Set());
    const dates = shown.texts.filter((text) => /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(text));
    expect(dates.length, 'with the column on, every row carries a date').toBeGreaterThan(0);

    const hidden = paintWithHidden(new Set(['date']));
    expect(
      hidden.texts.filter((text) => dates.includes(text)),
      'a hidden column paints nothing at all',
    ).toEqual([]);
    expect(hidden.texts, 'the SHA column stays').toContain('SHA');
    expect(hidden.texts.some((text) => /^[0-9a-f]{7}$/.test(text))).toBe(true);
  });

  it('a hidden SHA column draws no hashes and a hidden author column no names', () => {
    const noSha = paintWithHidden(new Set(['sha']));
    expect(noSha.texts.some((text) => /^[0-9a-f]{7}$/.test(text))).toBe(false);

    const noAuthor = paintWithHidden(new Set(['author']));
    expect(noAuthor.texts).not.toContain('AUTHOR');
  });
});

describe('a frame painted end to end', () => {
  it('draws the column header after the chips, so the frame reached its end', () => {
    const painted = paint([
      ref('main', 'localBranch', { upstream: 'origin/main', isHead: true }),
      ref('origin/main', 'remoteBranch'),
    ]);

    expect(painted.texts, 'the table header is set in caps').toContain('MESSAGE');
    expect(painted.texts).toContain('AUTHOR');
  });

  it('paints just as fully for a repository without a single ref', () => {
    expect(paint([]).texts).toContain('MESSAGE');
  });

  it('a chip without an upstream does not break the frame either', () => {
    expect(paint([ref('wip', 'localBranch')]).texts).toContain('MESSAGE');
  });
});

describe('badges on chips', () => {
  it('marks a local branch with the laptop glyph, and it sits to the right of the name', () => {
    const painted = paint([ref('wip', 'localBranch')]);

    const laptop = painted.strokedGlyphs.find((g) => g.d === GLYPH.local.d);
    const name = painted.placedTexts.find((t) => t.text === 'wip');
    expect(laptop, 'a local branch must carry the laptop badge').toBeDefined();
    expect(name, 'the branch name must be drawn').toBeDefined();
    expect(laptop!.x, 'the badge trails after the name').toBeGreaterThan(name!.x);
  });

  it('a local branch paired with its upstream carries both badges on one chip', () => {
    const painted = paint([
      ref('main', 'localBranch', { upstream: 'origin/main' }),
      ref('origin/main', 'remoteBranch'),
    ]);

    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.local.d),
      'the laptop of the local half',
    ).toBe(true);
    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.remote.d),
      'the cloud stands in for the remote avatar that has not loaded yet',
    ).toBe(true);
  });

  it('draws a loaded remote avatar as an image, and the cloud disappears', () => {
    const face = { fake: 'avatar' };
    const painted = paint(
      [ref('origin/dev', 'remoteBranch')],
      readyAvatars('remote:https://github.com/facebook.png', face),
    );

    expect(
      painted.drawnImages.some((i) => i.image === face),
      'the avatar image must reach the canvas',
    ).toBe(true);
    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.remote.d),
      'the cloud is only the fallback: with a live avatar it is gone',
    ).toBe(false);
  });

  it('ignores an avatar cached under the remote name: every repository has an origin', () => {
    const stale = { fake: 'stale' };
    const painted = paint(
      [ref('origin/dev', 'remoteBranch')],
      readyAvatars('remote:origin', stale),
    );

    expect(
      painted.drawnImages.some((i) => i.image === stale),
      'a key made from the remote name would serve an avatar left over from another repository',
    ).toBe(false);
    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.remote.d),
      'until the real avatar has loaded, the cloud stands in for it',
    ).toBe(true);
  });

  it('a branch with an open pull request carries its badge last in the tail', () => {
    const painted = paint([ref('wip', 'localBranch')], null, new Set(['wip']));

    const laptop = painted.strokedGlyphs.find((g) => g.d === GLYPH.local.d);
    const pull = painted.strokedGlyphs.find((g) => g.d === GLYPH.pull.d);
    expect(pull, 'an open pull request is marked with a badge').toBeDefined();
    expect(pull!.x, 'the pull request badge comes last in the tail').toBeGreaterThan(laptop!.x);
  });

  it('a branch without a pull request carries no pull request badge', () => {
    const painted = paint([ref('wip', 'localBranch')]);

    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.pull.d),
      'a badge with no pull request behind it would mean nothing',
    ).toBe(false);
  });

  it('the working tree row counts files by fate: modified, added, deleted', () => {
    const { texts, strokedGlyphs } = paint([], null, new Set(), null, true);

    expect(texts, 'the modified count stands next to the pencil').toContain('29');
    expect(texts, 'the added count stands next to the plus').toContain('7');
    expect(texts, 'the deleted count stands next to the minus').toContain('3');
    expect(
      strokedGlyphs.some((g) => g.d === GLYPH.modified.d),
      'the pencil marks modified files',
    ).toBe(true);
    expect(
      strokedGlyphs.some((g) => g.d === GLYPH.added.d),
      'the plus marks added files',
    ).toBe(true);
    expect(
      strokedGlyphs.some((g) => g.d === GLYPH.deleted.d),
      'the minus marks deleted files',
    ).toBe(true);
    expect(
      strokedGlyphs.some((g) => g.d === GLYPH.conflict.d),
      'counters that are zero are not drawn at all',
    ).toBe(false);
  });

  it('the highlight wraps the node with a semicircle on the left and stays off the branch column', () => {
    const painted = paint([]);

    expect(
      painted.filledRects.some((r) => r.h === 30 && r.x === 0 && r.w > 1000),
      'the rectangle spanning the whole row is a thing of the past',
    ).toBe(false);
    expect(
      corners.some(
        (r) => r === Math.min(rowBandHeight(METRICS_AVATARS) / 2, METRICS_AVATARS.nodeR + 1),
      ),
      'the left edge of the highlight rounds around the node: a semicircle when the band is as tall as the node',
    ).toBe(true);
  });

  it('rows are separated by a gap, and the band wraps the node from its left edge', () => {
    const painted = paint([]);
    const band = rowBandHeight(METRICS_AVATARS);
    const bands = bandFills(painted.tracedFills);

    expect(
      bands.some((b) => b.height === band),
      'the fill runs along the band, not along the whole row',
    ).toBe(true);
    expect(
      bands.some((b) => b.height === METRICS_AVATARS.rowH),
      'a band as tall as the row would meet its neighbour and the gap would vanish',
    ).toBe(false);
    const cap = Math.min(band / 2, METRICS_AVATARS.nodeR + 1);
    expect(
      bands.filter((b) => b.height === band).every((b) => b.left === 210 + GRAPH_INSET - cap),
      'the band starts at the left edge of the node, so a transparent avatar sits on it whole',
    ).toBe(true);
  });

  it('in the compact layout the band is a plain rectangle from the node centre: no wrap, no rounding', () => {
    tracedFills.length = 0;
    corners.length = 0;
    const frame = frameWith([]);
    drawFrame(canvas(), { ...frame, metrics: METRICS_COMPACT, selected: 1 });
    const band = rowBandHeight(METRICS_COMPACT);
    const bands = bandFills(tracedFills).filter((b) => b.height === band);
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.every((b) => b.left === 210 + GRAPH_INSET)).toBe(true);
    expect(corners.length, 'no rounded corner is traced for compact bands').toBe(0);
  });

  it('a hovered row with no refs of its own shows the owning branch dimmed', () => {
    calls.length = 0;
    texts.length = 0;
    placedTexts.length = 0;
    strokedGlyphs.length = 0;
    drawnImages.length = 0;
    filledRects.length = 0;
    arcs.length = 0;
    const frame = frameWith([ref('wip', 'localBranch')]);
    drawFrame(canvas(), { ...frame, hover: 2 });

    const shown = placedTexts.filter((t) => t.text === 'wip');
    expect(
      shown.length,
      'the branch name shows both on its tip and as a ghost on the hovered row',
    ).toBe(2);
    expect(shown[0].y, 'the ghost stands on a different row').not.toBe(shown[1].y);
  });

  it('a row that carries its own refs gets no ghost', () => {
    calls.length = 0;
    texts.length = 0;
    placedTexts.length = 0;
    strokedGlyphs.length = 0;
    drawnImages.length = 0;
    filledRects.length = 0;
    arcs.length = 0;
    const frame = frameWith([ref('wip', 'localBranch')]);
    drawFrame(canvas(), { ...frame, hover: 0 });

    expect(
      placedTexts.filter((t) => t.text === 'wip').length,
      'the ref of the row itself is already drawn, a second copy is not needed',
    ).toBe(1);
  });

  it('chips that did not fit are shown as a +N counter', () => {
    const painted = paint([
      ref('very-long-branch-name-one', 'localBranch'),
      ref('very-long-branch-name-two', 'localBranch'),
      ref('very-long-branch-name-three', 'localBranch'),
    ]);

    expect(painted.texts, 'the counter tells how many chips are hidden').toContain('+2');
  });

  it('a roomy column still shows one chip per row; the other names wait behind the counter', () => {
    const painted = paint([
      ref('a', 'localBranch'),
      ref('b', 'localBranch'),
      ref('c', 'localBranch'),
    ]);

    expect(painted.placedTexts.filter((t) => t.text === 'a').length, 'the first chip').toBe(1);
    expect(
      painted.placedTexts.some((t) => t.text === 'b'),
      'the second is not a chip',
    ).toBe(false);
    expect(painted.texts).toContain('+2');
  });

  const paintInColumn = (refs: RefView[], branchTag: number) => {
    texts.length = 0;
    placedTexts.length = 0;
    strokedGlyphs.length = 0;
    strokedPaths.length = 0;
    const frame = frameWith(refs);
    drawFrame(canvas(), { ...frame, cols: layoutColumns(1200, { branchTag }) });
    return { texts: [...texts], placedTexts: [...placedTexts], strokedGlyphs: [...strokedGlyphs] };
  };

  it('when the name no longer fits the chip keeps its badge and drops the name, not the other way round', () => {
    const painted = paintInColumn([ref('wip', 'localBranch')], 80);

    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.local.d),
      'the laptop badge is drawn in the narrow chip',
    ).toBe(true);
    expect(
      painted.placedTexts.some((t) => t.text === 'wip'),
      'the name is gone',
    ).toBe(false);
  });

  it('without its name the chip is a tight badge: four pixels of padding instead of nine, text and gap', () => {
    const wide = paintInColumn([ref('wip', 'localBranch')], 400);
    const narrow = paintInColumn([ref('wip', 'localBranch')], 80);
    const laptopIn = (p: typeof wide) => p.strokedGlyphs.find((g) => g.d === GLYPH.local.d)!.x;

    expect(
      laptopIn(wide) - laptopIn(narrow),
      'padding 9, text 40 and gap 4 gave way to padding 4',
    ).toBe(9 + 40 + 4 - 4);
  });

  it('the counter stays beside the badge while it fits, and goes when it does not', () => {
    const refs = [ref('a', 'localBranch'), ref('b', 'localBranch'), ref('c', 'localBranch')];

    const roomy = paintInColumn(refs, 120);
    expect(roomy.texts, 'a badge and the counter fit in 102 usable pixels').toContain('+2');
    expect(
      roomy.placedTexts.some((t) => t.text === 'a'),
      'the name went before the counter',
    ).toBe(false);

    const tight = paintInColumn(refs, 60);
    expect(tight.texts, 'in 42 usable pixels the counter goes').not.toContain('+2');
    expect(
      tight.strokedGlyphs.some((g) => g.d === GLYPH.local.d),
      'the badge is still there',
    ).toBe(true);
  });

  it('below 49 the badge slides to stay centred: five pixels of column move it by 2.5', () => {
    const at = (column: number) =>
      paintInColumn([ref('wip', 'localBranch')], column).strokedGlyphs.find(
        (g) => g.d === GLYPH.local.d,
      )!.x;

    expect(at(49) - at(44)).toBe(2.5);
    expect(at(56), 'and above 49 it holds still').toBe(at(49));
  });

  it('hovering any chip of a row that hides some unfolds the whole stack, not just that chip', () => {
    const painted = paint(
      [
        ref('very-long-branch-name-one', 'localBranch'),
        ref('very-long-branch-name-two', 'localBranch'),
        ref('very-long-branch-name-three', 'localBranch'),
      ],
      null,
      new Set(),
      { row: 0, at: 0, reach: 'branch' },
    );

    const two = painted.placedTexts.filter((t) => t.text === 'very-long-branch-name-two');
    expect(two.length, 'the hidden chips come out with the hovered one').toBeGreaterThan(0);
  });

  it('hovering the only chip of a row that hides nothing shows just its full name', () => {
    const painted = paint([ref('very-long-branch-name-one', 'localBranch')], null, new Set(), {
      row: 0,
      at: 0,
      reach: 'branch',
    });
    const shown = painted.placedTexts.filter((t) => t.text === 'very-long-branch-name-one');
    expect(shown.length).toBeGreaterThan(0);
  });

  it('every row of the unfolded stack is as wide as the widest, so a short first chip leaves no step', () => {
    measureText = (text) => ({ width: text.length * 8 });
    try {
      const painted = paint(
        [
          ref('main', 'localBranch', { isHead: true }),
          ref('a-much-longer-branch-name', 'localBranch'),
        ],
        null,
        new Set(),
        { row: 0, at: 0, reach: 'branch' },
      );
      const chipRects = painted.tracedFills
        .map((f) => ({ left: Math.min(...f.xs), right: Math.max(...f.xs), top: Math.min(...f.ys) }))
        .filter((r) => r.right - r.left > 20 && r.right - r.left < 400)
        .sort((a, b) => a.top - b.top);
      const panelTop = Math.min(...chipRects.map((r) => r.top));
      const chipLeft = Math.min(...chipRects.map((r) => r.left));
      const atTop = chipRects
        .filter((r) => r.top === panelTop && r.left === chipLeft)
        .map((r) => Math.round(r.right - r.left));
      const panelW = Math.max(...atTop);
      const afterPanel = atTop.slice(atTop.indexOf(panelW));
      expect(
        afterPanel.every((w) => w === panelW),
        'once the panel is down, the short first chip is painted as wide as the panel, not as a narrower block on top of it',
      ).toBe(true);
    } finally {
      measureText = () => ({ width: 40 });
    }
  });

  it('while the stack is unfolded the +N counter is not drawn on the row', () => {
    const refs = [
      ref('very-long-branch-name-one', 'localBranch'),
      ref('very-long-branch-name-two', 'localBranch'),
      ref('very-long-branch-name-three', 'localBranch'),
    ];
    expect(paint(refs).texts).toContain('+2');
    expect(paint(refs, null, new Set(), { row: 0, at: 0, reach: 'branch' }).texts).not.toContain(
      '+2',
    );
    expect(
      paint(refs, null, new Set(), { row: 0, at: 'more', reach: 'branch' }).texts,
    ).not.toContain('+2');
  });

  it('hovering the counter unfolds every chip into a stack', () => {
    const painted = paint(
      [
        ref('very-long-branch-name-one', 'localBranch'),
        ref('very-long-branch-name-two', 'localBranch'),
        ref('very-long-branch-name-three', 'localBranch'),
      ],
      null,
      new Set(),
      { row: 0, at: 'more', reach: 'branch' },
    );

    const one = painted.placedTexts.filter((t) => t.text === 'very-long-branch-name-one');
    const two = painted.placedTexts.filter((t) => t.text === 'very-long-branch-name-two');
    expect(one.length, 'the first chip of the stack shows its full name').toBeGreaterThan(0);
    expect(two.length, 'the hidden chip shows its full name in the stack too').toBeGreaterThan(0);
    expect(
      one[one.length - 1].y,
      'the stack is vertical, so the names sit on different rows',
    ).not.toBe(two[two.length - 1].y);
  });

  it('an unfolded row has one leader line, from the panel, not a second one from the row underneath', () => {
    const refs = [
      ref('very-long-branch-name-one', 'localBranch'),
      ref('very-long-branch-name-two', 'localBranch'),
      ref('very-long-branch-name-three', 'localBranch'),
    ];
    const leadersAtRow0 = (hoverChip: HoverChip | null) => {
      const painted = paint(refs, null, new Set(), hoverChip);
      const rowY = painted.placedTexts.find((t) => t.text === 'very-long-branch-name-one')!.y;
      return painted.tracedStrokes.filter(
        (s) => s.xs.length === 2 && s.ys[0] === s.ys[1] && s.ys[0] === rowY + 0.5,
      );
    };

    expect(leadersAtRow0(null).length, 'a folded row draws its own leader').toBe(1);
    expect(
      leadersAtRow0({ row: 0, at: 0, reach: 'branch' }).length,
      'unfolded: the panel draws the only one',
    ).toBe(1);
    expect(leadersAtRow0({ row: 0, at: 'more', reach: 'branch' }).length).toBe(1);
  });

  it('a hovered chip unfolds and is drawn on top of everything else', () => {
    const painted = paint([ref('wip', 'localBranch')], null, new Set(), {
      row: 0,
      at: 0,
      reach: 'branch',
    });

    const last = painted.placedTexts[painted.placedTexts.length - 1];
    expect(last.text, 'the unfolded chip is painted last, which is to say on top').toBe('wip');
  });

  it('a tag named like a pull request branch gets the tag badge, not the pull request one', () => {
    const painted = paint([ref('wip', 'tag')], null, new Set(['wip']));

    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.pull.d),
      'a name that matches a pull request branch does not turn the tag into a pull request',
    ).toBe(false);
    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.tag.d),
      'a tag chip wears the tag badge',
    ).toBe(true);
    expect(painted.texts).toContain('wip');
  });

  it('a stash has no chip: a square node with an icon, and no name is drawn', () => {
    const painted = paint([ref('stash@{0}', 'stash')]);

    expect(painted.texts, 'the stash@{0} chip is gone for good').not.toContain('stash@{0}');
    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.stash.d),
      'the stash icon sits inside the square node',
    ).toBe(true);
  });

  it('on HEAD the check mark stays in front of the name and the badge still goes to the right', () => {
    const painted = paint([ref('main', 'localBranch', { isHead: true })]);

    const name = painted.placedTexts.find((t) => t.text === '✓ main');
    const laptop = painted.strokedGlyphs.find((g) => g.d === GLYPH.local.d);
    expect(
      name,
      'the check mark and the name are one text run at the start of the chip',
    ).toBeDefined();
    expect(laptop, 'the laptop badge is there').toBeDefined();
    expect(laptop!.x, 'the badge sits to the right of the name').toBeGreaterThan(name!.x);
  });
});

describe('the WIP row during a conflicted merge', () => {
  it('turns into an orange warning banner instead of the counters', () => {
    const painted = paint([], null, new Set(), null, {
      conflicts: 2,
      inProgress: 'merge',
    });

    expect(painted.texts, 'the banner names the conflicts with the translated label').toContain(
      'two conflicts block the merge into main',
    );
    expect(
      painted.texts,
      'the file counters hide during a conflict: the row says one thing',
    ).not.toContain('29');
    const warning = painted.strokedGlyphs.find((g) => g.d === GLYPH.conflict.d);
    expect(warning, 'a warning triangle sits left of the text').toBeDefined();
    expect(painted.texts, 'no state badges on the band, only the warning').not.toContain(
      'merge in progress',
    );

    const cols = layoutColumns(1200, {});
    const band = painted.filledRects.find(
      (r) => r.x === cols.message.left && r.h === rowBandHeight(METRICS_AVATARS),
    );
    expect(
      band,
      'the band starts at the message column and is exactly as tall as a row band',
    ).toBeDefined();
    expect(
      band?.w,
      'and it runs to the right edge of the list, like the selection band, not a few pixels short',
    ).toBe(listWidth(1200, false) - cols.message.left);
  });

  it('without conflicts the WIP row stays counters', () => {
    const painted = paint([], null, new Set(), null, true);

    expect(painted.texts).toContain('29');
    expect(painted.texts).not.toContain('two conflicts block the merge into main');
  });
});

describe('the commit description in the graph', () => {
  it('the grey body line is drawn by default and the never mode hides it', () => {
    const shown = paint([]);
    expect(
      shown.texts.some((text) => text.includes('body first line')),
      'the default keeps the previous behaviour: the description is visible',
    ).toBe(true);

    localStorage.setItem('gitspy.graph.description', JSON.stringify('never'));
    const hidden = paint([]);
    expect(
      hidden.texts.some((text) => text.includes('body first line')),
      'a disabled description is not drawn even when there is room',
    ).toBe(false);
    localStorage.removeItem('gitspy.graph.description');
  });
});

describe('rows dimmed under a hovered ref', () => {
  const owned = (owners: (number | null)[]) => {
    const window = window_();
    return { ...window, rows: window.rows.map((row, i) => ({ ...row, owner: owners[i] })) };
  };

  const dims = (hoverChip: HoverChip | null, owners: (number | null)[], level = 1) => {
    const veil = new Map<number, number>();
    if (hoverChip) {
      owners.forEach((owner, row) => {
        if (rowIsDimmed(hoverChip, row, owner)) veil.set(row, level);
      });
    }
    const frame = {
      ...frameWith([ref('main', 'localBranch')], null, new Set(), hoverChip),
      veil: veil.size > 0 ? veil : null,
    };
    frame.rows.put(0, owned(owners));
    filledRects.length = 0;
    drawFrame(canvas(), frame);
    const cols = frame.cols;
    return filledRects
      .filter(
        (rect) =>
          rect.alpha < 1 &&
          rect.x === cols.message.left &&
          rect.h === METRICS_AVATARS.rowH &&
          rect.y >= 32,
      )
      .map((rect) => ({
        row: Math.round((rect.y - 32) / METRICS_AVATARS.rowH),
        width: rect.w,
        alpha: rect.alpha,
      }));
  };

  it('hovering a branch chip dims the message columns of the rows another branch owns', () => {
    const dimmed = dims({ row: 0, at: 0, reach: 'branch' }, [0, 0, 2]);
    expect(
      dimmed.map((d) => d.row),
      'rows 0 and 1 belong to the hovered tip, row 2 does not',
    ).toEqual([2]);
    expect(
      dimmed[0]?.width,
      'the veil runs from the message column to the edge of the list, leaving chips and the graph lit',
    ).toBe(listWidth(1200, false) - layoutColumns(1200, {}).message.left);
  });

  it('hovering a tag keeps only its own row lit', () => {
    expect(dims({ row: 0, at: 0, reach: 'commit' }, [0, 0, 0]).map((d) => d.row)).toEqual([1, 2]);
  });

  it('nothing is dimmed while no chip is hovered', () => {
    expect(dims(null, [0, 0, 2])).toEqual([]);
  });

  it('the veil is as strong as its level, so each row can fade in and out on its own', () => {
    const half = dims({ row: 0, at: 0, reach: 'branch' }, [0, 0, 2], 0.5)[0]?.alpha ?? 0;
    const full = dims({ row: 0, at: 0, reach: 'branch' }, [0, 0, 2], 1)[0]?.alpha ?? 0;
    expect(half, 'half way through the fade the veil is half as strong').toBeCloseTo(full / 2, 5);
    expect(dims({ row: 0, at: 0, reach: 'branch' }, [0, 0, 2], 0)).toEqual([]);
  });
});
