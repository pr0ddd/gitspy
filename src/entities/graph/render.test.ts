import { beforeAll, describe, expect, it, vi } from 'vitest';
import { drawFrame, METRICS_AVATARS, type Frame } from './index';
import { FLOORS, layoutColumns } from './columns';
import { listWidth, rowBandHeight } from './scene';
import { RowCache } from './rows';
import type { AvatarCache } from '@/shared/ui/avatarCache';
import { GLYPH } from './glyphs';
import type { RefKind, RefView, RepoView, WindowView } from '@/shared/api/types';

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
const filledRects: { x: number; y: number; w: number; h: number }[] = [];
const strokedPaths: { op: string; x: number; y: number }[][] = [];
const arcs: { x: number; y: number; r: number }[] = [];
let lastTranslateX = 0;

const context = () =>
  new Proxy(
    {
      canvas: { width: 0, height: 0 },
      measureText: () => ({ width: 40 }),
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
            });
          }
          if (key === 'arc') {
            arcs.push({ x: Number(args[0]), y: Number(args[1]), r: Number(args[2]) });
          }
        };
      },
      set() {
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
  hoverChip: { row: number; at: number | 'more' } | null = null,
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
  hoverChip: { row: number; at: number | 'more' } | null = null,
  workingTree: boolean | WipOver = false,
) => {
  calls.length = 0;
  texts.length = 0;
  placedTexts.length = 0;
  strokedGlyphs.length = 0;
  drawnImages.length = 0;
  filledRects.length = 0;
  arcs.length = 0;
  strokedPaths.length = 0;
  drawFrame(canvas(), frameWith(refs, avatars, pullHeads, hoverChip, workingTree));
  return { calls, texts, placedTexts, strokedGlyphs, drawnImages, filledRects, arcs, strokedPaths };
};

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
      painted.arcs.some((a) => a.r === rowBandHeight(METRICS_AVATARS) / 2),
      'the left edge of the highlight is a semicircle of half the band height around the node',
    ).toBe(true);
  });

  it('rows are separated by a gap: no band takes up the full row height', () => {
    const painted = paint([]);
    const band = rowBandHeight(METRICS_AVATARS);

    expect(
      painted.filledRects.some((r) => r.h === band && r.w > 100),
      'the fill runs along the band, not along the whole row',
    ).toBe(true);
    expect(
      painted.filledRects.some((r) => r.h === band && r.w > 100 && r.x < 224),
      'the band does not stick out to the left of the node centre',
    ).toBe(false);
    expect(
      painted.filledRects.some((r) => r.h === METRICS_AVATARS.rowH && r.w > 100),
      'a band as tall as the row would meet its neighbour and the gap would vanish',
    ).toBe(false);
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

  it('hovering the counter unfolds every chip into a stack', () => {
    const painted = paint(
      [
        ref('very-long-branch-name-one', 'localBranch'),
        ref('very-long-branch-name-two', 'localBranch'),
        ref('very-long-branch-name-three', 'localBranch'),
      ],
      null,
      new Set(),
      { row: 0, at: 'more' },
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

  it('a hovered chip unfolds and is drawn on top of everything else', () => {
    const painted = paint([ref('wip', 'localBranch')], null, new Set(), { row: 0, at: 0 });

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
