import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import * as ipc from '@/ipc';

vi.mock('@/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  commitFiles: vi.fn(() => Promise.resolve([])),
}));
import '../i18n';
import { Details } from './Details';
import { RowCache } from '@/entities/graph';
import type { Session } from '@/entities/repo';
import type { AvatarCache } from '@/avatarCache';
import type { ChangedFileView, PullView, RefView, RowView, WindowView } from '@/types';

const commitRow = (
  index: number,
  hash: string,
  committer?: Partial<Extract<RowView, { kind: 'commit' }>>,
): RowView => ({
  kind: 'commit',
  index,
  lane: 0,
  colour: 0,
  node: 0,
  hash,
  author: 'Ada',
  email: 'ada@example.com',
  time: 1_700_000_000,
  committer: 'Ada',
  committerEmail: 'ada@example.com',
  committerTime: 1_700_000_000,
  subject: `subject ${hash}`,
  body: '',
  ...committer,
});

const windowWith = (rows: RowView[]): WindowView => ({
  start: 0,
  rows,
  segOffsets: rows.map((_, i) => i).concat(rows.length),
  segKind: [],
  segFrom: [],
  segTo: [],
  segColour: [],
});

const sessionAt = (selected: number): Session => ({
  path: '/repo',
  name: 'repo',
  repo: null,
  refsByCommit: new Map(),
  worktrees: [],
  selected,
  loading: false,
});

const fileNamed = (path: string): ChangedFileView => ({
  status: 'M',
  path,
  oldPath: null,
  similarity: null,
  added: 1,
  deleted: 1,
  binary: false,
});

const avatars = { srcOf: () => 'data:,' } as unknown as AvatarCache;

type Extra = Partial<{ pulls: PullView[]; onOpenPull: (pull: PullView) => void }>;

const draw = (session: Session, rows: RowCache, extra: Extra = {}) =>
  render(
    <Details
      avatars={avatars}
      avatarTick={0}
      session={session}
      rows={rows}
      pending={0}
      conflicts={0}
      pulls={extra.pulls ?? []}
      onCopy={() => {}}
      onOpenWorkingTree={() => {}}
      onOpenFile={() => {}}
      onHistory={() => {}}
      onOpenPull={extra.onOpenPull ?? (() => {})}
    />,
  );

describe('файлы коммита при переключении', () => {
  it('пока грузятся файлы нового коммита, файлы старого не отображаются', async () => {
    const rows = new RowCache();
    rows.replaceAll(windowWith([commitRow(0, 'aaaa0000'), commitRow(1, 'bbbb0000')]));

    let releaseSecond: (files: ChangedFileView[]) => void = () => {};
    vi.mocked(ipc.commitFiles).mockImplementation((_repo, hash) =>
      hash === 'aaaa0000'
        ? Promise.resolve([fileNamed('src/old.ts')])
        : new Promise((resolve) => {
            releaseSecond = resolve;
          }),
    );

    const { rerender } = draw(sessionAt(0), rows);
    await act(async () => {});
    expect(screen.getByText('old.ts'), 'файлы выбранного коммита должны показаться').toBeTruthy();

    rerender(
      <Details
        avatars={avatars}
        avatarTick={0}
        session={sessionAt(1)}
        rows={rows}
        pending={0}
        conflicts={0}
        pulls={[]}
        onCopy={() => {}}
        onOpenWorkingTree={() => {}}
        onOpenFile={() => {}}
        onHistory={() => {}}
        onOpenPull={() => {}}
      />,
    );

    expect(
      screen.queryByText('old.ts'),
      'после смены коммита файлы старого не должны висеть до прихода новых',
    ).toBeNull();
    expect(
      screen.queryByText('This commit changed nothing'),
      'пока файлы грузятся, пустое состояние показывать нельзя',
    ).toBeNull();

    await act(async () => releaseSecond([fileNamed('src/new.ts')]));
    expect(screen.getByText('new.ts'), 'файлы нового коммита должны показаться').toBeTruthy();
  });
});

describe('две личности коммита', () => {
  it('когда автор и коммиттер совпадают, строки committed нет', async () => {
    const rows = new RowCache();
    rows.replaceAll(windowWith([commitRow(0, 'aaaa0000')]));
    draw(sessionAt(0), rows);
    await act(async () => {});
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(
      screen.queryByText('committed'),
      'одинаковые личности не дублируются второй строкой',
    ).toBeNull();
  });

  it('чужой коммиттер показывается отдельной строкой committed', async () => {
    const rows = new RowCache();
    rows.replaceAll(
      windowWith([
        commitRow(0, 'aaaa0000', {
          committer: 'GitHub',
          committerEmail: 'noreply@github.com',
          committerTime: 1_700_000_600,
        }),
      ]),
    );
    const { container } = draw(sessionAt(0), rows);
    await act(async () => {});
    expect(screen.getByText('GitHub'), 'имя коммиттера видно').toBeTruthy();
    expect(screen.getByText('committed'), 'подпись committed видна').toBeTruthy();
    expect(screen.getByText('authored'), 'подпись authored осталась').toBeTruthy();
    expect(
      container.querySelectorAll('img').length,
      'у бота хостинга не аватар-картинка, а фирменный знак — img только у автора',
    ).toBe(1);
  });
});

describe('пул-реквест на коммите', () => {
  const pullNamed = (headBranch: string): PullView => ({
    number: 42,
    title: 'Teach the parser about fences',
    draft: false,
    author: 'ada',
    authorAvatarUrl: '',
    headBranch,
    baseBranch: 'main',
    fromFork: false,
    updatedAt: '2026-08-06T00:00:00Z',
    mine: false,
    assignedToMe: false,
    awaitingMyReview: false,
  });

  const refAt = (commit: number, name: string): RefView => ({
    name,
    kind: 'localBranch',
    commit,
    oid: 'a'.repeat(40),
    isHead: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    gone: false,
  });

  it('плашка видна на вершине ветки пулла и открывает его по клику', async () => {
    const rows = new RowCache();
    rows.replaceAll(windowWith([commitRow(0, 'aaaa0000')]));
    const session = sessionAt(0);
    session.refsByCommit.set(0, [refAt(0, 'feature/fences')]);
    const opened: number[] = [];
    draw(session, rows, {
      pulls: [pullNamed('feature/fences')],
      onOpenPull: (pull) => opened.push(pull.number),
    });
    await act(async () => {});

    const plate = screen.getByText('Teach the parser about fences');
    expect(plate, 'плашка пулла видна').toBeTruthy();
    fireEvent.click(plate);
    expect(opened, 'клик по плашке открывает пулл').toEqual([42]);
  });

  it('без совпадения ветки плашки нет', async () => {
    const rows = new RowCache();
    rows.replaceAll(windowWith([commitRow(0, 'aaaa0000')]));
    draw(sessionAt(0), rows, { pulls: [pullNamed('feature/other')] });
    await act(async () => {});
    expect(screen.queryByText('Teach the parser about fences')).toBeNull();
  });
});
