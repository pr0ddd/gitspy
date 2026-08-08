import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { draftOf, setDraft, useAgentSessions } from '@/entities/agent';
import { acpPrompt } from '@/ipc';
import type { AcpCommandView } from '@/types';
import '@/i18n';
import { AgentComposer } from './AgentComposer';

vi.mock('@/ipc', () => ({
  acpOpen: vi.fn(),
  acpPrompt: vi.fn(async () => {}),
  acpPermission: vi.fn(async () => {}),
  acpRollback: vi.fn(async () => {}),
  acpSetConfig: vi.fn(async () => {}),
  acpCancel: vi.fn(async () => {}),
}));

const COMMANDS: AcpCommandView[] = [
  { name: 'usage', description: 'Show plan usage', hint: null },
  { name: 'compact', description: 'Compact the conversation', hint: null },
];

const withCommands = (commands: AcpCommandView[]) => {
  useAgentSessions.setState({
    sessions: [
      {
        id: 1,
        repo: '/a',
        title: 'claude',
        status: 'ready',
        config: [],
        usage: null,
        commands,
      },
    ],
    activeByRepo: { '/a': 1 },
  });
  render(<AgentComposer id={1} repo="/a" />);
  return screen.getByRole('textbox') as HTMLInputElement;
};

beforeEach(() => {
  vi.clearAllMocks();
  setDraft(1, '');
  useAgentSessions.setState({ sessions: [], activeByRepo: {} });
});

describe('слэш-команды в композере', () => {
  it('слэш открывает список команд агента с описаниями', async () => {
    const field = withCommands(COMMANDS);
    fireEvent.change(field, { target: { value: '/' } });
    expect(
      await screen.findByText('Show plan usage'),
      'команды приходят от агента, а не выдуманы нами',
    ).toBeTruthy();
  });

  it('без объявленных команд слэш ничего не открывает', () => {
    const field = withCommands([]);
    fireEvent.change(field, { target: { value: '/' } });
    expect(
      screen.queryAllByRole('option').length,
      'пустой список поверх поля — это только украденное место',
    ).toBe(0);
  });

  it('обычный текст списка не открывает', () => {
    const field = withCommands(COMMANDS);
    fireEvent.change(field, { target: { value: 'посмотри историю' } });
    expect(
      screen.queryByText('Show plan usage'),
      'список команд принадлежит слэшу, а не всякому вводу',
    ).toBeNull();
  });

  it('фильтр сужает список, выбор подставляет команду в поле', async () => {
    const field = withCommands(COMMANDS);
    fireEvent.change(field, { target: { value: '/comp' } });
    expect(
      screen.queryByText('Show plan usage'),
      'фильтр по подстроке убирает лишние команды',
    ).toBeNull();
    fireEvent.click(await screen.findByText('compact'));
    expect(field.value, 'команда подставляется, отправку решает человек').toBe('/compact ');
    expect(vi.mocked(acpPrompt), 'выбор команды — ещё не ход').not.toHaveBeenCalled();
  });

  it('подставленная команда закрывает список', async () => {
    const field = withCommands(COMMANDS);
    fireEvent.change(field, { target: { value: '/comp' } });
    fireEvent.click(await screen.findByText('compact'));
    expect(
      screen.queryByText('Compact the conversation'),
      'выбор сделан — список уходит с дороги',
    ).toBeNull();
  });

  it('стрелки ведут по списку, Enter подставляет выбранное', () => {
    const field = withCommands(COMMANDS);
    fireEvent.change(field, { target: { value: '/' } });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.value, 'Enter при открытом списке выбирает, а не отправляет').toBe('/compact ');
    expect(vi.mocked(acpPrompt), 'выбор клавиатурой тоже не заказывает ход').not.toHaveBeenCalled();
  });

  it('стрелка вверх с первой строки уходит на последнюю', () => {
    const field = withCommands(COMMANDS);
    fireEvent.change(field, { target: { value: '/' } });
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.value, 'список замкнут: вверх с начала ведёт в конец').toBe('/compact ');
  });

  it('Esc закрывает список и оставляет набранное', () => {
    const field = withCommands(COMMANDS);
    fireEvent.change(field, { target: { value: '/comp' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(
      screen.queryByText('Compact the conversation'),
      'Esc убирает список, не трогая ввода',
    ).toBeNull();
    expect(field.value, 'закрытый список не стирает набранное').toBe('/comp');
  });

  it('закрытый Esc список открывается снова при следующем вводе', () => {
    const field = withCommands(COMMANDS);
    fireEvent.change(field, { target: { value: '/comp' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.change(field, { target: { value: '/compa' } });
    expect(
      screen.getByText('Compact the conversation'),
      'следующая буква — снова подсказка, иначе Esc ломает поле навсегда',
    ).toBeTruthy();
  });

  it('положенное из дифа упоминание видно в поле', () => {
    const field = withCommands(COMMANDS);
    act(() => setDraft(1, '@src/a.ts:10-20'));
    expect(
      field.value,
      'кнопка ханка кладёт упоминание в черновик — иначе человек его не увидит',
    ).toBe('@src/a.ts:10-20');
  });

  it('отправка забирает черновик у сессии, а не только у поля', () => {
    const field = withCommands(COMMANDS);
    fireEvent.change(field, { target: { value: 'посмотри' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(draftOf(1), 'иначе вернувшийся к сессии человек увидит уже отправленное').toBe('');
  });

  it('команда уходит агенту обычным промптом', () => {
    const field = withCommands(COMMANDS);
    fireEvent.change(field, { target: { value: '/compact' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(
      vi.mocked(acpPrompt),
      'слэш-команда — это текст промпта, а не отдельный метод',
    ).toHaveBeenCalledWith(1, '/compact');
  });
});
