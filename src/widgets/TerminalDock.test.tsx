import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { TerminalDock } from './TerminalDock';

const draw = (dock: React.ReactElement) => render(<TooltipProvider>{dock}</TooltipProvider>);
import { createTermHost, useTermSessions } from '@/entities/terminal';
import { writeProfiles } from '@/features/terminal';
import '@/shared/config/i18n';

const { refit } = vi.hoisted(() => ({ refit: vi.fn() }));

vi.mock('@/entities/terminal', async (importActual) => ({
  ...(await importActual<typeof import('@/entities/terminal')>()),
  createTermHost: vi.fn(async () => ({
    id: 77,
    fit: refit,
    focus: () => {},
    dispose: () => {},
  })),
}));

vi.mock('@/shared/api/ipc', () => ({
  termOpen: vi.fn(async () => 1),
  termInput: vi.fn(),
  termResize: vi.fn(),
  termAck: vi.fn(),
  termKill: vi.fn(),
  openUrl: vi.fn(),
}));

describe('the terminal dock', () => {
  it('an opened dock starts a terminal right away, without asking a second time', async () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      await screen.findByRole('tab'),
      'the terminal button has already stated the intent — there is nothing to offer again',
    ).toBeTruthy();
    expect(
      screen.queryByText('No terminals yet'),
      'an empty dock with a lone button is an extra step out of nowhere',
    ).toBeNull();
  });

  it('once the last tab is closed, the dock does not start a new one by itself', async () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    await screen.findByRole('tab');
    fireEvent.click(screen.getByLabelText('Close terminal'));
    expect(
      await screen.findByText('No terminals yet'),
      'closing a tab is an intent too, and it must not be argued with',
    ).toBeTruthy();
    expect(
      screen.getByText('New terminal'),
      'getting back to a terminal takes one click',
    ).toBeTruthy();
  });

  it('while the session is starting up, the empty-state note never flashes', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByText('No terminals yet'),
      'an empty-state blink on the first frame reads as a breakage',
    ).toBeNull();
  });

  it('with a single profile the plus button is enough, without a picker arrow', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByLabelText('Start from a profile'),
      'a menu with a single item is one extra click and one extra arrow in the header',
    ).toBeNull();
    expect(
      screen.getByLabelText('New terminal'),
      'starting one more terminal is still possible',
    ).toBeTruthy();
  });

  it('sessions are visible in the list under their own titles', () => {
    useTermSessions.setState({
      sessions: [
        { id: 1, title: 'zsh', command: null, cwd: '/r', repo: '/r' },
        {
          id: 2,
          title: 'frontend build',
          command: 'npm run app',
          cwd: '/r',
          repo: '/r',
        },
      ],
      activeByRepo: { '/r': 2 },
    });
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.getByText('frontend build'),
      'the live session title is visible in the list',
    ).toBeTruthy();
    expect(
      screen.getByText('zsh'),
      'the neighbouring session does not disappear from the list',
    ).toBeTruthy();
    expect(
      screen.queryByText('No terminals yet'),
      'with sessions on screen there is no room for the empty-state note',
    ).toBeNull();
  });

  it('shows only the sessions of its own repository', () => {
    useTermSessions.setState({
      sessions: [
        { id: 1, title: 'zsh of gitspy', command: null, cwd: '/a', repo: '/a' },
        { id: 2, title: 'zsh of react', command: null, cwd: '/b', repo: '/b' },
      ],
      activeByRepo: { '/a': 1, '/b': 2 },
    });
    draw(<TerminalDock repo="/b" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByText('zsh of gitspy'),
      'another repository does not bring its own sessions along',
    ).toBeNull();
    expect(screen.getByText('zsh of react')).toBeTruthy();
  });

  it('puts sessions as tabs in a strip above the terminal, not as a column to the side', () => {
    useTermSessions.setState({
      sessions: [{ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a' }],
      activeByRepo: { '/a': 1 },
    });
    const { container } = draw(
      <TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />,
    );
    expect(
      container.querySelector('aside'),
      'a 256 px panel on the right ate the very width the terminal is opened for',
    ).toBeNull();
    expect(screen.getByText('zsh'), 'the session stays a selectable tab').toBeTruthy();
    expect(
      screen.queryByLabelText('Collapse sessions'),
      'there is nothing to collapse into a rail: the strip already takes a single row',
    ).toBeNull();
  });

  it('has no "Terminal" header above the dock', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    draw(<TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(screen.queryByText('Terminal'), 'a title bar only ate height').toBeNull();
  });

  it('sits at the bottom over the graph and starts no layout of its own', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    const { container } = draw(
      <TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />,
    );
    const root = container.querySelector('section');
    expect(
      root?.className.includes('bottom-0'),
      'the terminal lives at the bottom: it has no other place',
    ).toBe(true);
    expect(
      screen.queryByLabelText('Fullscreen'),
      'the dock has no fullscreen mode — the graph must not be pushed aside',
    ).toBeNull();
  });
});

describe('starting sessions from the dock', () => {
  it('a second profile brings up the picker arrow, and its item starts a session', async () => {
    useTermSessions.setState({
      sessions: [{ id: 1, title: 'zsh', command: null, cwd: '/r', repo: '/r' }],
      activeByRepo: { '/r': 1 },
    });
    writeProfiles([
      { label: 'zsh', command: null },
      { label: 'build', command: 'npm run app' },
    ]);
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    fireEvent.pointerDown(
      screen.getByLabelText('Start from a profile'),
      new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
    );
    fireEvent.click(await screen.findByText('build'));
    expect(
      vi.mocked(createTermHost).mock.calls.at(-1)?.[1].command,
      'picking a profile runs its command, not the login shell',
    ).toBe('npm run app');
    localStorage.clear();
  });
});

describe('the header of the session list', () => {
  it('spends no row on the word "Sessions" and a counter', () => {
    useTermSessions.setState({
      sessions: [{ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a' }],
      activeByRepo: { '/a': 1 },
    });
    draw(<TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByText('Sessions'),
      'the heading repeats what the content already shows',
    ).toBeNull();
  });

  it('closes the whole terminal from its own button', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    const closed = vi.fn();
    draw(<TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} onClose={closed} />);
    fireEvent.click(screen.getByLabelText('Close terminal panel'));
    expect(closed, 'the terminal is left from the same place it was opened').toHaveBeenCalledTimes(
      1,
    );
  });
});

describe('refitting the terminal to a new size', () => {
  let notifyResize: () => void = () => {};

  const watchingResizes = () => {
    class Watch {
      constructor(private readonly report: ResizeObserverCallback) {
        notifyResize = () => this.report([], this as unknown as ResizeObserver);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = Watch as unknown as typeof ResizeObserver;
  };

  const nextFrame = () =>
    act(async () => {
      await new Promise((done) => requestAnimationFrame(() => done(null)));
    });

  const dockWithOneTerminal = async () => {
    watchingResizes();
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    const view = draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    await screen.findByRole('tab');
    await nextFrame();
    refit.mockClear();
    const grip = view.container.querySelector('[data-grip="dock"]') as HTMLElement;
    return { grip };
  };

  it('reflows the content every frame while the splitter is held down', async () => {
    const { grip } = await dockWithOneTerminal();

    fireEvent.pointerDown(grip, { pointerId: 1 });
    notifyResize();
    await nextFrame();
    notifyResize();
    await nextFrame();

    expect(
      refit,
      'a terminal frozen until the end of the gesture shows the old grid under the new height',
    ).toHaveBeenCalledTimes(2);

    fireEvent.pointerUp(grip, { pointerId: 1 });
  });

  it('several notifications within one frame cost a single refit', async () => {
    const { grip } = await dockWithOneTerminal();

    fireEvent.pointerDown(grip, { pointerId: 1 });
    notifyResize();
    notifyResize();
    notifyResize();
    await nextFrame();

    expect(
      refit,
      'reflowing the buffer costs milliseconds, and more than once per frame it is not needed',
    ).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(grip, { pointerId: 1 });
  });

  it('a size that changed on its own is refitted within the same frame', async () => {
    await dockWithOneTerminal();

    notifyResize();
    await nextFrame();

    expect(
      refit,
      'opening a panel or switching a tab is not a gesture, there is nothing to wait for',
    ).toHaveBeenCalledTimes(1);
  });
});
