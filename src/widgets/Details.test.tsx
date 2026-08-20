import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import * as ipc from '@/shared/api/ipc';

vi.mock('@/shared/api/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  commitFiles: vi.fn(() => Promise.resolve([])),
}));
import '@/shared/config/i18n';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { Details } from './Details';
import { RowCache } from '@/entities/graph';
import type { Session } from '@/entities/repo';
import type { AvatarCache } from '@/shared/ui/avatarCache';
import type { ChangedFileView, PullView, RefView, RowView, WindowView } from '@/shared/api/types';

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
  owner: null,
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
    <TooltipProvider>
      <Details
        avatars={avatars}
        avatarTick={0}
        session={session}
        rows={rows}
        pending={0}
        conflicts={0}
        pulls={extra.pulls ?? []}
        picked={null}
        diffOpen={false}
        onPick={() => {}}
        onCopy={() => {}}
        onOpenWorkingTree={() => {}}
        onOpenFile={() => {}}
        onHistory={() => {}}
        onOpenPull={extra.onOpenPull ?? (() => {})}
      />
    </TooltipProvider>,
  );

describe('commit files while switching commits', () => {
  it('hides the files of the previous commit while the files of the next one load', async () => {
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
    expect(
      screen.getByText('old.ts'),
      'the files of the selected commit have to show up',
    ).toBeTruthy();

    rerender(
      <TooltipProvider>
        <Details
          avatars={avatars}
          avatarTick={0}
          session={sessionAt(1)}
          rows={rows}
          pending={0}
          conflicts={0}
          picked={null}
          diffOpen={false}
          onPick={() => {}}
          pulls={[]}
          onCopy={() => {}}
          onOpenWorkingTree={() => {}}
          onOpenFile={() => {}}
          onHistory={() => {}}
          onOpenPull={() => {}}
        />
      </TooltipProvider>,
    );

    expect(
      screen.queryByText('old.ts'),
      'after the commit changes the old files must not hang around until the new ones arrive',
    ).toBeNull();
    expect(
      screen.queryByText('This commit changed nothing'),
      'the empty state must not be shown while the files are still loading',
    ).toBeNull();

    await act(async () => releaseSecond([fileNamed('src/new.ts')]));
    expect(screen.getByText('new.ts'), 'the files of the new commit have to show up').toBeTruthy();
  });
});

describe('the two identities of a commit', () => {
  it('shows no committed line when the author and the committer are the same', async () => {
    const rows = new RowCache();
    rows.replaceAll(windowWith([commitRow(0, 'aaaa0000')]));
    draw(sessionAt(0), rows);
    await act(async () => {});
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(
      screen.queryByText('committed'),
      'identical identities are not duplicated by a second line',
    ).toBeNull();
  });

  it('shows a different committer on its own committed line', async () => {
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
    expect(screen.getByText('GitHub'), 'the name of the committer is visible').toBeTruthy();
    expect(screen.getByText('committed'), 'the committed label is visible').toBeTruthy();
    expect(screen.getByText('authored'), 'the authored label is still there').toBeTruthy();
    expect(
      container.querySelectorAll('img').length,
      'a host bot gets its brand mark instead of an avatar image, so only the author has an img',
    ).toBe(1);
  });
});

describe('pull request on a commit', () => {
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

  it('shows the plate on the tip of the branch of the pull request and opens it on click', async () => {
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
    expect(plate, 'the plate of the pull request is visible').toBeTruthy();
    fireEvent.click(plate);
    expect(opened, 'a click on the plate opens the pull request').toEqual([42]);
  });

  it('shows no plate when no branch matches', async () => {
    const rows = new RowCache();
    rows.replaceAll(windowWith([commitRow(0, 'aaaa0000')]));
    draw(sessionAt(0), rows, { pulls: [pullNamed('feature/other')] });
    await act(async () => {});
    expect(screen.queryByText('Teach the parser about fences')).toBeNull();
  });
});
