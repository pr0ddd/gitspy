import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TerminalDock } from './TerminalDock';
import { useAgentSessions } from '@/entities/agent';
import { useTermSessions } from '@/entities/terminal';
import { feedOf, openAgentSession } from '@/features/agent';
import '@/i18n';

vi.mock('@/ipc', () => ({
  termOpen: vi.fn(async () => 1),
  termInput: vi.fn(),
  termResize: vi.fn(),
  termAck: vi.fn(),
  termKill: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock('@/features/agent', () => ({
  feedOf: vi.fn(() => []),
  onFeed: vi.fn(() => () => {}),
  openAgentSession: vi.fn(async () => 9),
  sendPrompt: vi.fn(async () => {}),
  answerPermission: vi.fn(async () => {}),
  rollbackCheckpoint: vi.fn(async () => {}),
}));

describe('док терминалов', () => {
  it('пустой док показывает подсказку и кнопку нового терминала', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    useAgentSessions.setState({ sessions: [], activeByRepo: {} });
    render(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(screen.getByText('No terminals yet'), 'пустота названа честно').toBeTruthy();
    expect(
      screen.getByText('New terminal'),
      'из пустого дока терминал заводится одним кликом',
    ).toBeTruthy();
  });

  it('сессии видны в списке справа со своими заголовками', () => {
    useTermSessions.setState({
      sessions: [
        { id: 1, title: 'zsh', command: null, cwd: '/r', repo: '/r', status: 'idle' },
        {
          id: 2,
          title: 'сборка фронта',
          command: 'npm run app',
          cwd: '/r',
          repo: '/r',
          status: 'running',
        },
      ],
      activeByRepo: { '/r': 2 },
    });
    useAgentSessions.setState({ sessions: [], activeByRepo: {} });
    render(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(screen.getByText('сборка фронта'), 'живой заголовок сессии виден в списке').toBeTruthy();
    expect(screen.getByText('zsh'), 'соседняя сессия из списка не пропадает').toBeTruthy();
    expect(
      screen.queryByText('No terminals yet'),
      'с сессиями подсказке о пустоте места нет',
    ).toBeNull();
  });

  it('агентская сессия стоит в том же списке и открывает свою ленту вместо терминала', () => {
    useTermSessions.setState({
      sessions: [{ id: 1, title: 'zsh', command: null, cwd: '/r', repo: '/r', status: 'idle' }],
      activeByRepo: { '/r': 1 },
    });
    useAgentSessions.setState({
      sessions: [
        {
          id: 2,
          repo: '/r',
          title: 'claude · ACP',
          status: 'ready',
          config: [],
          commands: [],
          usage: null,
        },
      ],
      activeByRepo: {},
    });
    vi.mocked(feedOf).mockReturnValue([{ kind: 'agent', text: 'починил сборку' }]);
    render(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByLabelText('Agent session'),
      'пока выбран терминал, лента агента не занимает сцену',
    ).toBeNull();
    fireEvent.click(screen.getByText('claude · ACP'));
    expect(
      screen.getByLabelText('Agent session'),
      'выбранная агентская сессия рендерит ленту, а не терминал',
    ).toBeTruthy();
    expect(screen.getByText('починил сборку'), 'лента показывает ответ агента').toBeTruthy();
    fireEvent.click(screen.getByText('zsh'));
    expect(
      screen.queryByLabelText('Agent session'),
      'возврат к терминалу убирает ленту со сцены',
    ).toBeNull();
  });

  it('одна агентская сессия занимает док без подсказки о пустоте', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    useAgentSessions.setState({
      sessions: [
        {
          id: 3,
          repo: '/r',
          title: 'claude · ACP',
          status: 'working',
          config: [],
          commands: [],
          usage: null,
        },
      ],
      activeByRepo: {},
    });
    vi.mocked(feedOf).mockReturnValue([]);
    render(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByText('No terminals yet'),
      'сессия в доке есть — пустым он себя называть не должен',
    ).toBeNull();
  });

  it('док показывает только сессии своего репозитория', () => {
    useTermSessions.setState({
      sessions: [
        { id: 1, title: 'zsh гитспая', command: null, cwd: '/a', repo: '/a', status: 'idle' },
        { id: 2, title: 'zsh реакта', command: null, cwd: '/b', repo: '/b', status: 'idle' },
      ],
      activeByRepo: { '/a': 1, '/b': 2 },
    });
    useAgentSessions.setState({ sessions: [], activeByRepo: {} });
    render(<TerminalDock repo="/b" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByText('zsh гитспая'),
      'чужой репозиторий не приносит свои сессии',
    ).toBeNull();
    expect(screen.getByText('zsh реакта')).toBeTruthy();
  });

  it('свёрнутый список остаётся навигацией: иконки сессий и кнопка новой', () => {
    useTermSessions.setState({
      sessions: [{ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a', status: 'idle' }],
      activeByRepo: { '/a': 1 },
    });
    useAgentSessions.setState({ sessions: [], activeByRepo: {} });
    render(<TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />);
    fireEvent.click(screen.getByLabelText('Collapse sessions'));
    expect(
      screen.getByLabelText('New terminal'),
      'свёрнутая полоса не теряет кнопку новой сессии',
    ).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: 'zsh' }).length,
      'сессии остаются кликабельными иконками',
    ).toBe(1);
  });

  it('шапки «Terminal» над доком нет', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    useAgentSessions.setState({ sessions: [], activeByRepo: {} });
    render(<TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(screen.queryByText('Terminal'), 'полоса-заголовок только ела высоту').toBeNull();
  });
});

describe('запуск сессий из дока', () => {
  it('пункт меню «claude · ACP» открывает агентскую сессию репозитория', async () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    useAgentSessions.setState({ sessions: [], activeByRepo: {} });
    render(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    fireEvent.pointerDown(
      screen.getByLabelText('Start from a profile'),
      new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
    );
    const item = await screen.findByText('claude · ACP');
    fireEvent.click(item);
    expect(
      vi.mocked(openAgentSession),
      'выбор профиля агента обязан открывать сессию, а не молчать',
    ).toHaveBeenCalledWith('/r');
  });

  it('открытая агентская сессия становится активной и показывает ленту', () => {
    useTermSessions.setState({
      sessions: [{ id: 1, title: 'zsh', command: null, cwd: '/r', repo: '/r', status: 'idle' }],
      activeByRepo: { '/r': 1 },
    });
    useAgentSessions.setState({
      sessions: [
        { id: 9, repo: '/r', title: 'claude · ACP', status: 'ready', config: [], commands: [], usage: null },
      ],
      activeByRepo: { '/r': 9 },
    });
    render(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.getByLabelText('Agent session'),
      'новая сессия агента обязана выйти на сцену поверх открытого терминала',
    ).toBeTruthy();
  });
});

describe('отклик на запуск агента', () => {
  it('пока адаптер поднимается, в списке видно заводящуюся сессию', async () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    useAgentSessions.setState({ sessions: [], activeByRepo: {} });
    let release: (id: number) => void = () => {};
    vi.mocked(openAgentSession).mockImplementation(
      () => new Promise<number>((resolve) => (release = resolve)),
    );
    render(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    fireEvent.pointerDown(
      screen.getByLabelText('Start from a profile'),
      new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
    );
    fireEvent.click(await screen.findByText('claude · ACP'));
    expect(
      await screen.findByText('Starting…'),
      'две секунды тишины после клика человек читает как поломку',
    ).toBeTruthy();
    release(9);
  });
});
