import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Profiler } from 'react';
import { act, render } from '@testing-library/react';
import { GraphView } from './GraphView';
import { CHUNK, RowCache } from '../rows';
import { METRICS_AVATARS } from '../scene';
import { newSession, type Session } from '../session';
import type { RepoView, RowView, WindowView } from '../types';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const repo = (count: number): RepoView => ({
  path: '/repo',
  count,
  maxLane: 4,
  head: 0,
  truncated: false,
  readMs: 1,
  layoutMs: 1,
  minimap: [],
  minimapColours: [],
  refs: [],
});

const row = (index: number): RowView => ({
  kind: 'commit',
  index,
  lane: 0,
  colour: 0,
  node: 0,
  hash: `h${index}`,
  author: 'pr0d',
  email: 'p@example.com',
  time: 0,
  subject: 's',
  body: '',
});

const window = (): WindowView => ({
  start: 0,
  rows: Array.from({ length: CHUNK }, (_, i) => row(i)),
  segOffsets: Array.from({ length: CHUNK + 1 }, () => 0),
  segKind: [],
  segFrom: [],
  segTo: [],
  segColour: [],
});

const sessionWith = (count: number): Session => ({
  ...newSession('/repo'),
  repo: repo(count),
  loading: false,
});

describe('прокрутка графа', () => {
  it('не вызывает ни одного React-рендера', () => {
    const rows = new RowCache();
    rows.put(0, window());

    let commits = 0;
    const { container } = render(
      <Profiler id="graph" onRender={() => (commits += 1)}>
        <GraphView
          session={sessionWith(CHUNK)}
          avatars={null}
          rows={rows}
          redraw={0}
          metrics={METRICS_AVATARS}
          onSelect={() => {}}
          onNeed={() => {}}
        message=""
        onMessage={() => {}}
        onCommit={() => {}}
        />
      </Profiler>,
    );
    const host = container.querySelector('.relative') as HTMLElement;
    expect(host).toBeTruthy();

    const afterMount = commits;
    act(() => {
      for (let i = 0; i < 30; i++) {
        host.dispatchEvent(
          new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }),
        );
      }
    });

    expect(commits).toBe(afterMount);
  });

  it('просит недостающие полосы, а рисование не блокирует', () => {
    const rows = new RowCache();
    const asked: number[][] = [];

    render(
      <GraphView
        session={sessionWith(CHUNK * 8)}
        avatars={null}
        rows={rows}
        redraw={0}
        metrics={METRICS_AVATARS}
        onSelect={() => {}}
        onNeed={(chunks) => asked.push(chunks)}
        message=""
        onMessage={() => {}}
        onCommit={() => {}}
      />,
    );

    expect(asked.length).toBeGreaterThan(0);
    expect(asked[0]).toContain(0);
  });
});
