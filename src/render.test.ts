import { beforeAll, describe, expect, it, vi } from 'vitest';
import { drawFrame, METRICS_AVATARS, type Frame } from './render';
import { layoutColumns } from './columns';
import { RowCache } from './rows';
import type { AvatarCache } from './avatarCache';
import { GLYPH } from './glyphs';
import type { RefKind, RefView, RepoView, WindowView } from './types';

class RecordedPath {
  d: string | undefined;
  constructor(d?: string) {
    this.d = d;
  }
  moveTo() {}
  lineTo() {}
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
  oid: "refoid",
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
  remotes: [{ name: 'origin', avatarUrl: 'https://github.com/facebook.png', webUrl: 'https://github.com/facebook/react' }],
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
    subject: 'тема',
    body: '',
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
      branchTag: 'ветки',
      graph: 'граф',
      message: 'сообщение',
      author: 'автор',
      date: 'дата',
      sha: 'sha',
      workingTree: 'дерево',
      inProgress: 'слияние идёт',
      mergeConflicts: 'два конфликта на пути в main',
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
  drawFrame(canvas(), frameWith(refs, avatars, pullHeads, hoverChip, workingTree));
  return { calls, texts, placedTexts, strokedGlyphs, drawnImages, filledRects, arcs };
};

describe('кадр рисуется целиком', () => {
  it('заголовок колонок рисуется после чипов, значит кадр дошёл до конца', () => {
    const painted = paint([
      ref('main', 'localBranch', { upstream: 'origin/main', isHead: true }),
      ref('origin/main', 'remoteBranch'),
    ]);

    expect(painted.texts).toContain('сообщение');
    expect(painted.texts).toContain('автор');
  });

  it('репозиторий без единой ссылки рисуется так же полно', () => {
    expect(paint([]).texts).toContain('сообщение');
  });

  it('чип без upstream тоже не роняет кадр', () => {
    expect(paint([ref('wip', 'localBranch')]).texts).toContain('сообщение');
  });
});

describe('метки на чипах', () => {
  it('локальная ветка несёт ноутбук, и он стоит справа от имени, как в the reference client', () => {
    const painted = paint([ref('wip', 'localBranch')]);

    const laptop = painted.strokedGlyphs.find((g) => g.d === GLYPH.local.d);
    const name = painted.placedTexts.find((t) => t.text === 'wip');
    expect(laptop, 'у локальной ветки должна быть метка-ноутбук').toBeDefined();
    expect(name, 'имя ветки должно рисоваться').toBeDefined();
    expect(laptop!.x, 'метка идёт хвостом после имени').toBeGreaterThan(name!.x);
  });

  it('пара локальная+upstream несёт обе метки на одном чипе', () => {
    const painted = paint([
      ref('main', 'localBranch', { upstream: 'origin/main' }),
      ref('origin/main', 'remoteBranch'),
    ]);

    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.local.d),
      'ноутбук локальной половины',
    ).toBe(true);
    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.remote.d),
      'облако вместо незагруженного аватара сервера',
    ).toBe(true);
  });

  it('загруженный аватар сервера рисуется картинкой, и облако исчезает', () => {
    const face = { fake: 'avatar' };
    const painted = paint(
      [ref('origin/dev', 'remoteBranch')],
      readyAvatars('remote:https://github.com/facebook.png', face),
    );

    expect(
      painted.drawnImages.some((i) => i.image === face),
      'картинка аватара должна дойти до канваса',
    ).toBe(true);
    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.remote.d),
      'облако — только запасной вид, при живом аватаре его нет',
    ).toBe(false);
  });

  it('аватар, закэшированный по имени remote, не подхватывается: origin есть у каждого репозитория', () => {
    const stale = { fake: 'stale' };
    const painted = paint(
      [ref('origin/dev', 'remoteBranch')],
      readyAvatars('remote:origin', stale),
    );

    expect(
      painted.drawnImages.some((i) => i.image === stale),
      'ключ по имени подсовывал бы чужой аватар из прошлого репозитория',
    ).toBe(false);
    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.remote.d),
      'пока настоящий аватар не загружен — облако',
    ).toBe(true);
  });

  it('ветка с открытым пул-реквестом несёт его значок последним в хвосте', () => {
    const painted = paint([ref('wip', 'localBranch')], null, new Set(['wip']));

    const laptop = painted.strokedGlyphs.find((g) => g.d === GLYPH.local.d);
    const pull = painted.strokedGlyphs.find((g) => g.d === GLYPH.pull.d);
    expect(pull, 'открытый PR подписывается значком, как в the reference client').toBeDefined();
    expect(pull!.x, 'значок PR — последний в хвосте').toBeGreaterThan(laptop!.x);
  });

  it('ветка без пул-реквеста значка PR не несёт', () => {
    const painted = paint([ref('wip', 'localBranch')]);

    expect(
      painted.strokedGlyphs.some((g) => g.d === GLYPH.pull.d),
      'значок без PR за ним ничего бы не значил',
    ).toBe(false);
  });

  it('строка рабочего дерева считает файлы по судьбе: изменено, добавлено, удалено', () => {
    const { texts, strokedGlyphs } = paint([], null, new Set(), null, true);

    expect(texts, 'число изменённых рядом с карандашом').toContain('29');
    expect(texts, 'число добавленных рядом с плюсом').toContain('7');
    expect(texts, 'число удалённых рядом с минусом').toContain('3');
    expect(
      strokedGlyphs.some((g) => g.d === GLYPH.modified.d),
      'карандаш — знак изменённых, как в the reference client',
    ).toBe(true);
    expect(
      strokedGlyphs.some((g) => g.d === GLYPH.added.d),
      'плюс — знак добавленных',
    ).toBe(true);
    expect(
      strokedGlyphs.some((g) => g.d === GLYPH.deleted.d),
      'минус — знак удалённых',
    ).toBe(true);
    expect(
      strokedGlyphs.some((g) => g.d === GLYPH.conflict.d),
      'нулевые счётчики не рисуются',
    ).toBe(false);
  });

  it('подсветка огибает узел полукругом слева и не заезжает на колонку веток', () => {
    const painted = paint([]);

    expect(
      painted.filledRects.some((r) => r.h === 30 && r.x === 0 && r.w > 1000),
      'прямоугольник на всю строку ушёл в прошлое',
    ).toBe(false);
    expect(
      painted.arcs.some((a) => a.r === METRICS_AVATARS.rowH / 2),
      'левый край подсветки — полукруг радиусом в полстроки вокруг узла',
    ).toBe(true);
  });

  it('наведённая строка без своих ссылок показывает ветку-владельца приглушённо', () => {
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
    expect(shown.length, 'имя ветки видно и на вершине, и призраком на наведённой').toBe(2);
    expect(shown[0].y, 'призрак стоит на другой строке').not.toBe(shown[1].y);
  });

  it('у строки со своими ссылками призрака нет', () => {
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
      'своя ссылка уже нарисована — второй раз не нужно',
    ).toBe(1);
  });

  it('не влезшие чипы показываются счётчиком +N', () => {
    const painted = paint([
      ref('very-long-branch-name-one', 'localBranch'),
      ref('very-long-branch-name-two', 'localBranch'),
      ref('very-long-branch-name-three', 'localBranch'),
    ]);

    expect(painted.texts, 'счётчик сообщает, сколько спрятано').toContain('+2');
  });

  it('ховер по счётчику раскрывает все чипы стопкой', () => {
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
    expect(one.length, 'первый чип в стопке с полным именем').toBeGreaterThan(0);
    expect(two.length, 'спрятанный чип в стопке с полным именем').toBeGreaterThan(0);
    expect(
      one[one.length - 1].y,
      'стопка вертикальная — имена на разных строках',
    ).not.toBe(two[two.length - 1].y);
  });

  it('наведённый чип раскрывается и рисуется поверх всего остального', () => {
    const painted = paint([ref('wip', 'localBranch')], null, new Set(), { row: 0, at: 0 });

    const last = painted.placedTexts[painted.placedTexts.length - 1];
    expect(last.text, 'раскрытый чип кладётся последним, то есть поверх').toBe('wip');
  });

  it('тег с именем как у PR-ветки значка не получает', () => {
    const painted = paint([ref('wip', 'tag')], null, new Set(['wip']));

    expect(painted.strokedGlyphs).toEqual([]);
    expect(painted.texts).toContain('wip');
  });

  it('чип стеша остаётся голым именем', () => {
    const painted = paint([ref('stash@{0}', 'stash')]);

    expect(painted.strokedGlyphs).toEqual([]);
    expect(painted.texts).toContain('stash@{0}');
  });

  it('у HEAD галочка остаётся в начале имени, а метка всё равно справа', () => {
    const painted = paint([ref('main', 'localBranch', { isHead: true })]);

    const name = painted.placedTexts.find((t) => t.text === '✓ main');
    const laptop = painted.strokedGlyphs.find((g) => g.d === GLYPH.local.d);
    expect(name, 'галочка и имя — одна строка в начале чипа').toBeDefined();
    expect(laptop, 'метка-ноутбук на месте').toBeDefined();
    expect(laptop!.x, 'метка правее имени').toBeGreaterThan(name!.x);
  });

});

describe('строка WIP во время конфликтного слияния', () => {
  it('становится оранжевым баннером с предупреждением вместо счётчиков', () => {
    const painted = paint([], null, new Set(), null, {
      conflicts: 2,
      inProgress: 'merge',
    });

    expect(
      painted.texts,
      'баннер называет конфликты словами из перевода',
    ).toContain('два конфликта на пути в main');
    expect(
      painted.texts,
      'счётчики файлов при конфликте прячутся — строка говорит об одном',
    ).not.toContain('29');
    const warning = painted.strokedGlyphs.find((g) => g.d === GLYPH.conflict.d);
    expect(warning, 'слева от текста — треугольник предупреждения').toBeDefined();
    expect(
      painted.texts,
      'никаких меток состояния на полосе — только предупреждение',
    ).not.toContain('слияние идёт');
  });

  it('без конфликтов строка WIP остаётся счётчиками', () => {
    const painted = paint([], null, new Set(), null, true);

    expect(painted.texts).toContain('29');
    expect(painted.texts).not.toContain('два конфликта на пути в main');
  });
});
