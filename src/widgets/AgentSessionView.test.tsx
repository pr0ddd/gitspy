import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentSessions } from '@/entities/agent';
import type { FeedItem } from '@/entities/agent';
import { answerPermission, feedOf, rollbackCheckpoint, sendPrompt } from '@/features/agent';
import '@/i18n';
import { AgentSessionView } from './AgentSessionView';

vi.mock('@/features/agent', () => ({
  feedOf: vi.fn(() => []),
  onFeed: vi.fn(() => () => {}),
  sendPrompt: vi.fn(async () => {}),
  stopTurn: vi.fn(async () => {}),
  answerPermission: vi.fn(async () => {}),
  rollbackCheckpoint: vi.fn(async () => {}),
  openAgentSession: vi.fn(async () => 1),
}));

const ID = 7;

const askDemo: FeedItem = {
  kind: 'permission',
  requestId: 5,
  title: 'Write demo.txt',
  options: [
    { id: 'allow', label: 'Разрешить' },
    { id: 'deny', label: 'Отклонить' },
    { id: 'allow_always', label: 'Always for this session' },
  ],
  resolved: null,
};

const shown = (items: FeedItem[], status: 'working' | 'waiting' | 'ready' | 'dead' = 'waiting') => {
  useAgentSessions.setState({
    sessions: [
      { id: ID, repo: '/r', title: 'claude · ACP', status, config: [], commands: [], usage: null },
    ],
    activeByRepo: { '/r': ID },
  });
  vi.mocked(feedOf).mockReturnValue(items);
  return render(<AgentSessionView id={ID} repo="/r" />);
};

beforeEach(() => {
  vi.clearAllMocks();
  useAgentSessions.setState({ sessions: [], activeByRepo: {} });
});

describe('панель агентской сессии', () => {
  it('своей шапки у панели сессии нет: имя и состояние живут в списке дока', () => {
    shown([], 'waiting');
    expect(
      screen.queryByText('claude · ACP'),
      'вторая строка с именем сессии над лентой только ела высоту',
    ).toBeNull();
    expect(
      screen.getByPlaceholderText('Type / for commands'),
      'ввод остаётся нижней строкой панели, как в самом Claude Code',
    ).toBeTruthy();
  });

  it('лента показывает реплику человека, ответ агента и вызов инструмента', () => {
    shown([
      { kind: 'user', text: 'почини сборку' },
      { kind: 'agent', text: 'смотрю логи' },
      {
        kind: 'tool',
        id: 't1',
        title: 'Edit build.rs',
        status: 'in_progress',
        terminalId: null,
        exit: null,
      },
      { kind: 'ended', reason: 'end_turn' },
    ]);
    expect(screen.getByText('почини сборку'), 'сказанное человеком остаётся в ленте').toBeTruthy();
    expect(screen.getByText('смотрю логи'), 'ответ агента виден целиком').toBeTruthy();
    expect(
      screen.getByText('Edit build.rs'),
      'вызов инструмента — отдельная карточка, а не пропажа',
    ).toBeTruthy();
    expect(screen.getByText('end_turn'), 'конец хода отмечен в ленте').toBeTruthy();
  });

  it('карточка разрешения даёт кнопку на каждый вариант, клик уходит агенту', () => {
    shown([askDemo]);
    expect(screen.getByText('Write demo.txt'), 'спрошено именно про этот инструмент').toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Always for this session' }),
      'вариант без известного нам имени показывается словами агента',
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(
      vi.mocked(answerPermission),
      'выбор уходит той же сессии с тем же request_id',
    ).toHaveBeenCalledWith(ID, 5, 'allow');
  });

  it('отвеченное разрешение кнопок больше не показывает', () => {
    shown([{ ...askDemo, resolved: 'deny' }]);
    expect(
      screen.queryByRole('button', { name: 'Allow' }),
      'второй раз ответить на решённый запрос нельзя',
    ).toBeNull();
    expect(screen.getByText('Deny'), 'сделанный выбор остаётся видимым').toBeTruthy();
  });

  it('чекпоинт предлагает откат всех записанных ходом путей', () => {
    shown([{ kind: 'checkpoint', oid: 'abc', paths: ['a.txt', 'b.txt'] }]);
    expect(screen.getByText('a.txt, b.txt'), 'записанные пути названы поимённо').toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));
    expect(
      vi.mocked(rollbackCheckpoint),
      'откат называет снапшот и все пути того же хода',
    ).toHaveBeenCalledWith('/r', { oid: 'abc', paths: ['a.txt', 'b.txt'] });
  });

  it('набранный текст уходит промптом и поле пустеет', () => {
    shown([]);
    const field = screen.getByPlaceholderText('Type / for commands');
    fireEvent.change(field, { target: { value: 'почини сборку' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(
      vi.mocked(sendPrompt),
      'промпт уходит той же сессии тем же текстом',
    ).toHaveBeenCalledWith(ID, 'почини сборку');
    expect((field as HTMLInputElement).value, 'отправленный текст в поле не залипает').toBe('');
  });

  it('пустой промпт на границу не уходит', () => {
    shown([]);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(vi.mocked(sendPrompt), 'пустой ход агенту не заказывают').not.toHaveBeenCalled();
  });
});
