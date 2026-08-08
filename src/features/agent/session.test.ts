import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acpCancel, acpOpen, acpPermission, acpPrompt, acpRollback, acpSetConfig } from '@/ipc';
import { draftOf, useAgentSessions } from '@/entities/agent';
import type { AcpConfigOptionView, AcpEventView } from '@/types';
import {
  answerPermission,
  askAgentAbout,
  feedOf,
  onFeed,
  openAgentSession,
  rollbackCheckpoint,
  sendPrompt,
  setConfigValue,
  stopTurn,
} from './session';

vi.mock('@/ipc', () => ({
  acpOpen: vi.fn(),
  acpPrompt: vi.fn(async () => {}),
  acpPermission: vi.fn(async () => {}),
  acpRollback: vi.fn(async () => {}),
  acpSetConfig: vi.fn(async () => {}),
  acpCancel: vi.fn(async () => {}),
}));

type EventSink = (event: AcpEventView) => void;

const MODEL: AcpConfigOptionView = {
  id: 'model',
  name: 'Model',
  description: null,
  category: 'model',
  currentValue: 'fable',
  choices: [
    { value: 'fable', name: 'Fable 5' },
    { value: 'opus', name: 'Opus 5' },
  ],
};

const askPermission: AcpEventView = {
  kind: 'permission',
  requestId: 5,
  title: 'Edit demo.txt',
  options: [
    { id: 'allow', label: 'Allow' },
    { id: 'deny', label: 'Deny' },
  ],
};

const opened = async (id: number): Promise<{ id: number; emit: EventSink }> => {
  let sink: EventSink = () => {};
  vi.mocked(acpOpen).mockImplementation(async (_repo, onEvent) => {
    sink = onEvent;
    return id;
  });
  return { id: await openAgentSession('/r'), emit: (event) => sink(event) };
};

beforeEach(() => {
  vi.clearAllMocks();
  useAgentSessions.setState({ sessions: [], activeByRepo: {} });
});

describe('действия агентской сессии', () => {
  it('открытие спавнит adapter ACP и заводит сессию в сторе', async () => {
    const { id } = await opened(11);
    expect(
      vi.mocked(acpOpen).mock.calls[0][0],
      'сессия открывается для своего репозитория, а чем запускать адаптер — знает граница',
    ).toBe('/r');
    expect(
      useAgentSessions.getState().sessions,
      'сессия видна в списке дока сразу после открытия',
    ).toEqual([
      {
        id,
        repo: '/r',
        title: 'claude · ACP',
        status: 'ready',
        config: [],
        commands: [],
        usage: null,
      },
    ]);
    expect(feedOf(id), 'новая сессия начинается с пустой ленты').toEqual([]);
  });

  it('объявленные агентом опции и расход попадают в сессию, а не в ленту', async () => {
    const { id, emit } = await opened(17);
    emit({ kind: 'config', options: [MODEL] });
    emit({ kind: 'configValue', configId: 'model', value: 'opus' });
    emit({
      kind: 'usage',
      used: 1200,
      size: 200000,
      cost: 0.02,
      currency: 'USD',
      limits: [{ kind: 'five_hour', resetsAt: 1786116000, usedShare: null, status: 'allowed' }],
    });
    const session = useAgentSessions.getState().sessions[0];
    expect(
      session.config[0].currentValue,
      'подтверждённое агентом значение видно в чипе, а не только у агента',
    ).toBe('opus');
    expect(session.usage, 'окно контекста меряет агент, а не мы').toEqual({
      used: 1200,
      size: 200000,
      cost: 0.02,
      currency: 'USD',
      limits: [{ kind: 'five_hour', resetsAt: 1786116000, usedShare: null, status: 'allowed' }],
    });
    expect(feedOf(id), 'управление сессией — не реплика в ленте').toEqual([]);
  });

  it('смена значения опции уходит агенту той же сессии', async () => {
    const { id } = await opened(18);
    await setConfigValue(id, 'model', 'opus');
    expect(
      vi.mocked(acpSetConfig),
      'выбор в чипе — это session/set_config_option, а не текст промпта',
    ).toHaveBeenCalledWith(id, 'model', 'opus');
  });

  it('событие с границы ведёт ленту и статус сессии', async () => {
    const { id, emit } = await opened(12);
    emit(askPermission);
    expect(feedOf(id)[0], 'запрос разрешения становится карточкой ленты').toMatchObject({
      kind: 'permission',
      requestId: 5,
      resolved: null,
    });
    expect(
      useAgentSessions.getState().sessions[0].status,
      'пока разрешение не дано, сессия ждёт человека',
    ).toBe('waiting');
  });

  it('событие, пришедшее до возврата id, не теряется', async () => {
    vi.mocked(acpOpen).mockImplementation(async (_repo, onEvent) => {
      onEvent({ kind: 'messageChunk', text: 'уже говорю' });
      return 16;
    });
    const id = await openAgentSession('/r');
    expect(feedOf(id), 'агент начинает отвечать раньше, чем граница вернула номер сессии').toEqual([
      { kind: 'agent', text: 'уже говорю' },
    ]);
  });

  it('подписка узнаёт о новой ленте', async () => {
    const { id, emit } = await opened(13);
    const seen = vi.fn();
    const stop = onFeed(id, seen);
    emit({ kind: 'messageChunk', text: 'привет' });
    expect(
      seen,
      'без уведомления панель сессии осталась бы со старой лентой',
    ).toHaveBeenCalledTimes(1);
    stop();
    emit({ kind: 'messageChunk', text: 'мир' });
    expect(seen, 'отписка обрывает уведомления').toHaveBeenCalledTimes(1);
  });

  it('отправка промпта кладёт реплику в ленту и уходит на границу', async () => {
    const { id } = await opened(14);
    await sendPrompt(id, 'почини сборку');
    expect(feedOf(id), 'сказанное человеком видно в ленте до ответа агента').toEqual([
      { kind: 'user', text: 'почини сборку' },
    ]);
    expect(vi.mocked(acpPrompt), 'промпт уходит той же сессии тем же текстом').toHaveBeenCalledWith(
      id,
      'почини сборку',
    );
    expect(
      useAgentSessions.getState().sessions[0].status,
      'с уходом промпта сессия в работе, а не готова',
    ).toBe('working');
  });



  it('упавший промпт красит сессию мёртвой и виден в ленте', async () => {
    const { id } = await opened(31);
    vi.mocked(acpPrompt).mockRejectedValueOnce({ code: 'acp.gone' });
    await sendPrompt(id, 'привет');
    expect(feedOf(id).at(-1), 'ошибка границы попадает в ленту, а не в пустоту').toMatchObject({
      kind: 'ended',
    });
    expect(
      useAgentSessions.getState().sessions[0].status,
      'мёртвая сессия не притворяется готовой',
    ).toBe('dead');
  });

  it('упавший ответ на разрешение тоже красит сессию мёртвой', async () => {
    const { id, emit } = await opened(32);
    emit(askPermission);
    vi.mocked(acpPermission).mockRejectedValueOnce({ code: 'acp.gone' });
    await answerPermission(id, 5, 'allow');
    expect(
      useAgentSessions.getState().sessions[0].status,
      'ошибка ответа на разрешение не остаётся немой',
    ).toBe('dead');
  });

  it('ответ на разрешение резолвит карточку и уходит на границу', async () => {
    const { id, emit } = await opened(15);
    emit(askPermission);
    await answerPermission(id, 5, 'allow');
    expect(
      feedOf(id)[0],
      'карточка помнит выбранный вариант — кнопкам больше не место',
    ).toMatchObject({ kind: 'permission', resolved: 'allow' });
    expect(
      vi.mocked(acpPermission),
      'выбор уходит агенту с тем же request_id',
    ).toHaveBeenCalledWith(id, 5, 'allow');
    expect(
      useAgentSessions.getState().sessions[0].status,
      'после ответа сессия снова работает, а не ждёт',
    ).toBe('working');
  });

  it('стоп отменяет ход и сессия показывает это сразу', async () => {
    const { id } = await opened(20);
    await sendPrompt(id, 'долгая задача');
    await stopTurn(id);
    expect(
      vi.mocked(acpCancel),
      'стоп — это отмена хода той же сессии, а не убийство адаптера',
    ).toHaveBeenCalledWith(id);
    expect(
      useAgentSessions.getState().sessions[0].status,
      'нажатый стоп виден сразу, не дожидаясь агента',
    ).toBe('stopping');
  });

  it('поток агента после стопа не отменяет нажатие', async () => {
    const { id, emit } = await opened(21);
    await sendPrompt(id, 'долгая задача');
    await stopTurn(id);
    emit({ kind: 'messageChunk', text: 'ещё договариваю' });
    expect(
      useAgentSessions.getState().sessions[0].status,
      'кнопка не должна отжиматься сама: стоп держится до конца хода',
    ).toBe('stopping');
    emit({ kind: 'turnEnded', stopReason: 'cancelled' });
    expect(
      useAgentSessions.getState().sessions[0].status,
      'отменённый ход возвращает сессию в готовность',
    ).toBe('ready');
  });

  it('упавший стоп красит сессию мёртвой', async () => {
    const { id } = await opened(22);
    vi.mocked(acpCancel).mockRejectedValueOnce({ code: 'acp.gone' });
    await stopTurn(id);
    expect(
      useAgentSessions.getState().sessions[0].status,
      'сессия, которая не умеет остановиться, не притворяется живой',
    ).toBe('dead');
  });

  it('вопрос по ханку идёт в живую сессию репозитория, новую не плодит', async () => {
    const { id } = await opened(41);
    useAgentSessions.getState().setActive('/r', id);
    const asked = await askAgentAbout('/r', '@src/a.ts:10-20');
    expect(asked, 'у репозитория уже есть сессия — вторая не нужна').toBe(id);
    expect(draftOf(id)).toBe('@src/a.ts:10-20');
    expect(vi.mocked(acpOpen), 'лишняя сессия агента — лишний процесс').toHaveBeenCalledTimes(1);
  });

  it('без сессии вопрос по ханку её открывает', async () => {
    vi.mocked(acpOpen).mockImplementation(async () => 42);
    const asked = await askAgentAbout('/r', '@src/a.ts:1-2');
    expect(asked).toBe(42);
    expect(draftOf(42)).toBe('@src/a.ts:1-2');
  });

  it('поднятый в доке терминал не прячет живую сессию агента', async () => {
    const { id } = await opened(44);
    useAgentSessions.getState().setActive('/r', null);
    const asked = await askAgentAbout('/r', '@a.ts');
    expect(asked, 'док показал терминал — агент от этого не исчез').toBe(id);
    expect(
      vi.mocked(acpOpen),
      'иначе каждый вопрос после терминала стоил бы нового процесса',
    ).toHaveBeenCalledTimes(1);
  });

  it('второе упоминание дописывается к первому', async () => {
    const { id } = await opened(43);
    useAgentSessions.getState().setActive('/r', id);
    await askAgentAbout('/r', '@a.ts:1-2');
    await askAgentAbout('/r', '@b.ts');
    expect(draftOf(id), 'человек собирает контекст из нескольких мест').toBe('@a.ts:1-2 @b.ts');
  });

  it('откат чекпоинта уходит на границу целиком', async () => {
    await rollbackCheckpoint('/r', { oid: 'abc', paths: ['a.txt', 'b.txt'] });
    expect(
      vi.mocked(acpRollback),
      'откат называет снапшот и все записанные ходом пути',
    ).toHaveBeenCalledWith('/r', 'abc', ['a.txt', 'b.txt']);
  });
});
