import { describe, expect, it } from 'vitest';
import { drawFrame, METRICS_AVATARS, type Frame } from './render';
import { layoutColumns } from './columns';
import { RowCache } from './rows';
import type { RefKind, RefView, RepoView, WindowView } from './types';

const calls: string[] = [];
const texts: string[] = [];

const context = () =>
  new Proxy(
    {
      canvas: { width: 0, height: 0 },
      measureText: () => ({ width: 40 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      getContext: () => null,
    } as Record<string, unknown>,
    {
      get(target, key: string) {
        if (key in target) return target[key];
        return (...args: unknown[]) => {
          calls.push(key);
          if (key === 'fillText' && typeof args[0] === 'string') texts.push(args[0]);
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
  remotes: [],
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

const frameWith = (refs: RefView[]): Frame => {
  const rows = new RowCache();
  rows.put(0, window_());
  const byCommit = new Map<number, RefView[]>();
  if (refs.length) byCommit.set(0, refs);

  return {
    repo: repo(refs),
    rows,
    columns: {
      branchTag: 'ветки',
      graph: 'граф',
      message: 'сообщение',
      author: 'автор',
      date: 'дата',
      sha: 'sha',
      workingTree: 'дерево',
      inProgress: '',
    },
    cols: layoutColumns(1200, {}),
    avatars: null,
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

const paint = (refs: RefView[]) => {
  calls.length = 0;
  texts.length = 0;
  drawFrame(canvas(), frameWith(refs));
  return { calls, texts };
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
