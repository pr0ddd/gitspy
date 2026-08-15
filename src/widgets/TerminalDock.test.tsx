import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TerminalDock } from './TerminalDock';

const draw = (dock: React.ReactElement) => render(<TooltipProvider>{dock}</TooltipProvider>);
import { createTermHost, useTermSessions } from '@/entities/terminal';
import { writeProfiles } from '@/features/terminal';
import '@/i18n';

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

vi.mock('@/ipc', () => ({
  termOpen: vi.fn(async () => 1),
  termInput: vi.fn(),
  termResize: vi.fn(),
  termAck: vi.fn(),
  termKill: vi.fn(),
  openUrl: vi.fn(),
}));

describe('док терминалов', () => {
  it('открытый док сразу заводит терминал, не спрашивая второй раз', async () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      await screen.findByRole('tab'),
      'кнопкой терминала намерение уже высказано — предлагать его ещё раз нечего',
    ).toBeTruthy();
    expect(
      screen.queryByText('No terminals yet'),
      'пустой док с одинокой кнопкой — лишний шаг на ровном месте',
    ).toBeNull();
  });

  it('закрыв последнюю вкладку, док не заводит новую сам', async () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    await screen.findByRole('tab');
    fireEvent.click(screen.getByLabelText('Close terminal'));
    expect(
      await screen.findByText('No terminals yet'),
      'закрытая вкладка — тоже намерение, и спорить с ним нельзя',
    ).toBeTruthy();
    expect(
      screen.getByText('New terminal'),
      'вернуться к терминалу можно одним кликом',
    ).toBeTruthy();
  });

  it('пока сессия поднимается, подсказки о пустоте не мелькает', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByText('No terminals yet'),
      'мигание «пусто» на первом кадре читается как поломка',
    ).toBeNull();
  });

  it('одного профиля хватает кнопки «плюс» без стрелки выбора', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByLabelText('Start from a profile'),
      'меню из одного пункта — лишний клик и лишняя стрелка в шапке',
    ).toBeNull();
    expect(
      screen.getByLabelText('New terminal'),
      'завести ещё один терминал всё ещё можно',
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
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(screen.getByText('сборка фронта'), 'живой заголовок сессии виден в списке').toBeTruthy();
    expect(screen.getByText('zsh'), 'соседняя сессия из списка не пропадает').toBeTruthy();
    expect(
      screen.queryByText('No terminals yet'),
      'с сессиями подсказке о пустоте места нет',
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
    draw(<TerminalDock repo="/b" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByText('zsh гитспая'),
      'чужой репозиторий не приносит свои сессии',
    ).toBeNull();
    expect(screen.getByText('zsh реакта')).toBeTruthy();
  });

  it('сессии стоят вкладками в полоске над терминалом, а не колонкой сбоку', () => {
    useTermSessions.setState({
      sessions: [{ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a', status: 'idle' }],
      activeByRepo: { '/a': 1 },
    });
    const { container } = draw(
      <TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />,
    );
    expect(
      container.querySelector('aside'),
      'панель на 256 px справа съедала ширину, ради которой терминал и разворачивают',
    ).toBeNull();
    expect(screen.getByText('zsh'), 'сессия остаётся выбираемой вкладкой').toBeTruthy();
    expect(
      screen.queryByLabelText('Collapse sessions'),
      'сворачивать в рельсу нечего: полоска и так занимает одну строку',
    ).toBeNull();
  });

  it('шапки «Terminal» над доком нет', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    draw(<TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(screen.queryByText('Terminal'), 'полоса-заголовок только ела высоту').toBeNull();
  });

  it('док лежит внизу поверх графа и не заводит своей раскладки', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    const { container } = draw(
      <TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />,
    );
    const root = container.querySelector('section');
    expect(
      root?.className.includes('bottom-0'),
      'терминал живёт снизу: другого места у него нет',
    ).toBe(true);
    expect(
      screen.queryByLabelText('Fullscreen'),
      'полноэкранного режима у дока нет — граф не должен уезжать вбок',
    ).toBeNull();
  });
});

describe('запуск сессий из дока', () => {
  it('со вторым профилем появляется стрелка выбора, и её пункт заводит сессию', async () => {
    useTermSessions.setState({
      sessions: [{ id: 1, title: 'zsh', command: null, cwd: '/r', repo: '/r', status: 'idle' }],
      activeByRepo: { '/r': 1 },
    });
    writeProfiles([
      { label: 'zsh', command: null },
      { label: 'сборка', command: 'npm run app' },
    ]);
    draw(<TerminalDock repo="/r" onFileLink={() => {}} onHashLink={() => {}} />);
    fireEvent.pointerDown(
      screen.getByLabelText('Start from a profile'),
      new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
    );
    fireEvent.click(await screen.findByText('сборка'));
    expect(
      vi.mocked(createTermHost).mock.calls.at(-1)?.[1].command,
      'выбор профиля запускает его команду, а не логин-шелл',
    ).toBe('npm run app');
    localStorage.clear();
  });
});

describe('шапка списка сессий', () => {
  it('не тратит строку на слово «Sessions» и счётчик', () => {
    useTermSessions.setState({
      sessions: [{ id: 1, title: 'zsh', command: null, cwd: '/a', repo: '/a', status: 'idle' }],
      activeByRepo: { '/a': 1 },
    });
    draw(<TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} />);
    expect(
      screen.queryByText('Sessions'),
      'заголовок повторяет то, что и так видно из содержимого',
    ).toBeNull();
  });

  it('закрывает терминал целиком по своей кнопке', () => {
    useTermSessions.setState({ sessions: [], activeByRepo: {} });
    const closed = vi.fn();
    draw(<TerminalDock repo="/a" onFileLink={() => {}} onHashLink={() => {}} onClose={closed} />);
    fireEvent.click(screen.getByLabelText('Close terminal panel'));
    expect(
      closed,
      'уйти из терминала можно тем же местом, где его открывали',
    ).toHaveBeenCalledTimes(1);
  });
});

describe('подгон терминала под новый размер', () => {
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

  it('пока разделитель зажат, содержимое перекладывается каждый кадр', async () => {
    const { grip } = await dockWithOneTerminal();

    fireEvent.pointerDown(grip, { pointerId: 1 });
    notifyResize();
    await nextFrame();
    notifyResize();
    await nextFrame();

    expect(
      refit,
      'терминал, застывший до конца жеста, показывает старую сетку под новой высотой',
    ).toHaveBeenCalledTimes(2);

    fireEvent.pointerUp(grip, { pointerId: 1 });
  });

  it('несколько уведомлений об одном кадре стоят одного подгона', async () => {
    const { grip } = await dockWithOneTerminal();

    fireEvent.pointerDown(grip, { pointerId: 1 });
    notifyResize();
    notifyResize();
    notifyResize();
    await nextFrame();

    expect(
      refit,
      'перелив буфера стоит миллисекунды, и больше одного раза за кадр он не нужен',
    ).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(grip, { pointerId: 1 });
  });

  it('размер, изменившийся сам по себе, подгоняется тем же кадром', async () => {
    await dockWithOneTerminal();

    notifyResize();
    await nextFrame();

    expect(
      refit,
      'открытие панели или смена вкладки — не жест, ждать тут нечего',
    ).toHaveBeenCalledTimes(1);
  });
});
