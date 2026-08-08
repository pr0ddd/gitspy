import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentStatus } from '@/entities/agent';
import { useAgentSessions } from '@/entities/agent';
import { acpCancel, acpPrompt } from '@/ipc';
import '@/i18n';
import { pushTerminalBytes } from '@/entities/agent';
import { AgentComposer } from './AgentComposer';
import { AgentFeed, FeedRow, SubagentCard, ToolCard } from './AgentFeed';
import type { FeedItem } from '@/entities/agent';

vi.mock('@/ipc', () => ({
  acpOpen: vi.fn(),
  acpPrompt: vi.fn(async () => {}),
  acpPermission: vi.fn(async () => {}),
  acpRollback: vi.fn(async () => {}),
  acpSetConfig: vi.fn(async () => {}),
  acpCancel: vi.fn(async () => {}),
}));

const painted: string[] = [];

vi.mock('@/entities/terminal', () => ({
  createReadOnlyTermHost: vi.fn(() => ({
    write: (bytes: Uint8Array) => painted.push(new TextDecoder().decode(bytes)),
    fit: () => {},
    dispose: () => {},
  })),
}));

const atStatus = (status: AgentStatus) => {
  useAgentSessions.setState({
    sessions: [
      { id: 1, repo: '/a', title: 'claude', status, config: [], commands: [], usage: null },
    ],
    activeByRepo: { '/a': 1 },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  useAgentSessions.setState({ sessions: [], activeByRepo: {} });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('жизненный цикл хода', () => {
  it('пока агент работает, видно состояние и счётчик времени', () => {
    vi.useFakeTimers();
    atStatus('working');
    render(<AgentFeed id={1} repo="/a" />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Working'), 'ход обязан называть себя').toBeTruthy();
    expect(
      screen.getByText('3s'),
      'молчащий экран во время хода — это сломанный экран',
    ).toBeTruthy();
  });

  it('после стопа строка активности говорит, что идёт остановка', () => {
    atStatus('stopping');
    render(<AgentFeed id={1} repo="/a" />);
    expect(
      screen.getByText('Stopping…'),
      'нажатый стоп виден в ленте, пока агент не закончил ход',
    ).toBeTruthy();
  });

  it('в покое строки активности нет', () => {
    atStatus('ready');
    render(<AgentFeed id={1} repo="/a" />);
    expect(
      screen.queryByText('Working'),
      'вечная строка хода врала бы о том, что агент занят',
    ).toBeNull();
  });

  it('во время хода кнопка отправки становится кнопкой стоп', () => {
    atStatus('working');
    render(<AgentComposer id={1} repo="/a" />);
    expect(
      screen.queryByRole('button', { name: 'Send' }),
      'второй ход поверх первого не заказывают',
    ).toBeNull();
    fireEvent.click(screen.getByLabelText('Stop'));
    expect(
      vi.mocked(acpCancel),
      'стоп — это отмена хода, а не убийство адаптера',
    ).toHaveBeenCalledWith(1);
    expect(
      useAgentSessions.getState().sessions[0].status,
      'нажатый стоп виден сразу, не дожидаясь агента',
    ).toBe('stopping');
  });

  it('во время хода Enter не заказывает второй ход', () => {
    atStatus('working');
    render(<AgentComposer id={1} repo="/a" />);
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: 'ещё одно' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(
      vi.mocked(acpPrompt),
      'пока идёт ход, Enter не имеет права послать второй промпт',
    ).not.toHaveBeenCalled();
  });

  it('в покое кнопка снова отправляет', () => {
    atStatus('ready');
    render(<AgentComposer id={1} repo="/a" />);
    expect(
      screen.queryByLabelText('Stop'),
      'останавливать нечего, пока агент не работает',
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });
});

const inside: FeedItem[] = [
  { kind: 'tool', id: 'in1', title: 'ls -la', status: 'completed', terminalId: null, exit: null },
  {
    kind: 'tool',
    id: 'in2',
    title: 'cat a.txt',
    status: 'completed',
    terminalId: null,
    exit: null,
  },
];

describe('карточка команды агента', () => {
  it('карточка с терминалом несёт панель вывода', () => {
    render(<ToolCard title="Terminal" status="in_progress" terminalId="term_5" exit={null} />);
    expect(
      screen.getByLabelText('Command output'),
      'команды агента идут в нашу панель, иначе их вывода не видно нигде',
    ).toBeTruthy();
  });

  it('карточка без терминала панели не заводит', () => {
    render(<ToolCard title="Edit demo.txt" status="in_progress" terminalId={null} exit={null} />);
    expect(
      screen.queryByLabelText('Command output'),
      'пустая чёрная панель под правкой файла — это враньё про то, что там что-то шло',
    ).toBeNull();
  });

  it('код выхода команды виден в шапке карточки', () => {
    render(
      <ToolCard
        title="Terminal"
        status="failed"
        terminalId="term_6"
        exit={{ code: 3, signal: null }}
      />,
    );
    expect(
      screen.getByText('exit 3'),
      'провалившаяся команда обязана назвать код, иначе агент и человек видят разное',
    ).toBeTruthy();
  });

  it('оборванная сигналом команда называет сигнал, а не выдуманный код', () => {
    render(
      <ToolCard
        title="Terminal"
        status="failed"
        terminalId="term_7"
        exit={{ code: null, signal: 'SIGKILL' }}
      />,
    );
    expect(
      screen.getByText('SIGKILL'),
      'по чему оборвалась команда — единственное, что о ней известно',
    ).toBeTruthy();
  });

  it('стенограмма субагента свёрнута и называет число вложенных вызовов', () => {
    render(<SubagentCard title="Task" done={false} items={inside} id={1} repo="/a" />);
    expect(
      screen.getByText('2 calls'),
      'свёрнутая стенограмма обязана сказать, сколько работы под ней',
    ).toBeTruthy();
    expect(
      screen.queryByText('ls -la'),
      'десяток карточек подзадачи в ленте прячет собственный ответ агента',
    ).toBeNull();
  });

  it('развёрнутая стенограмма показывает вызовы подзадачи', () => {
    render(<SubagentCard title="Task" done items={inside} id={1} repo="/a" />);
    fireEvent.click(screen.getByRole('button', { name: /Task/ }));
    expect(
      screen.getByText('ls -la'),
      'спрятать работу субагента насовсем значит скрыть, чем он занимался',
    ).toBeTruthy();
    expect(screen.getByText('cat a.txt')).toBeTruthy();
  });

  it('панель получает байты своего терминала и не получает чужих', () => {
    painted.length = 0;
    pushTerminalBytes('term_8', new TextEncoder().encode('ГОТОВО'));
    pushTerminalBytes('term_9', new TextEncoder().encode('ЧУЖОЕ'));
    render(<ToolCard title="Terminal" status="completed" terminalId="term_8" exit={null} />);
    expect(
      painted.join(''),
      'панель без байтов — это чёрный прямоугольник вместо вывода команды',
    ).toBe('ГОТОВО');
  });
});

describe('реплики человека и ответы агента различимы', () => {
  it('сказанное человеком помечено и отделено от текста агента', () => {
    const { container } = render(
      <>
        <FeedRow item={{ kind: 'user', text: 'давай' }} id={1} repo="/a" />
        <FeedRow item={{ kind: 'agent', text: 'сделал' }} id={1} repo="/a" />
      </>,
    );
    const [said, answered] = [...container.querySelectorAll('[data-said-by]')];
    expect(
      [said.getAttribute('data-said-by'), answered.getAttribute('data-said-by')],
      'кто говорит — видно из разметки, а не угадывается по отступу',
    ).toEqual(['user', 'agent']);
    expect(
      said.className === answered.className,
      'одинаково выглядящие реплики сливаются в ленте в одну простыню',
    ).toBe(false);
  });

  it('у реплики человека есть свой знак начала', () => {
    render(<FeedRow item={{ kind: 'user', text: 'давай' }} id={1} repo="/a" />);
    expect(
      screen.getByText('❯'),
      'взгляд цепляется за знак быстрее, чем за оттенок фона',
    ).toBeTruthy();
  });
});
