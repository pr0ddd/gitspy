import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentUsage } from '@/entities/agent';
import { useAgentSessions } from '@/entities/agent';
import { acpSetConfig } from '@/ipc';
import { sendPrompt } from '@/features/agent';
import type { AcpCommandView, AcpConfigOptionView, AcpRateLimitView } from '@/types';
import '@/i18n';
import { AgentChips } from './AgentChips';

vi.mock('@/features/agent', async (real) => ({
  ...(await real<typeof import('@/features/agent')>()),
  sendPrompt: vi.fn(async () => {}),
}));

vi.mock('@/ipc', () => ({
  acpOpen: vi.fn(),
  acpPrompt: vi.fn(async () => {}),
  acpPermission: vi.fn(async () => {}),
  acpRollback: vi.fn(async () => {}),
  acpSetConfig: vi.fn(async () => {}),
}));

const OPTIONS: AcpConfigOptionView[] = [
  {
    id: 'mode',
    name: 'Mode',
    description: null,
    category: 'mode',
    currentValue: 'ask',
    choices: [
      { value: 'ask', name: 'Ask' },
      { value: 'auto', name: 'Auto' },
    ],
  },
  {
    id: 'model',
    name: 'Model',
    description: null,
    category: 'model',
    currentValue: 'fable',
    choices: [
      { value: 'fable', name: 'Fable 5' },
      { value: 'opus', name: 'Opus 5' },
    ],
  },
  {
    id: 'effort',
    name: 'Effort',
    description: null,
    category: 'thought_level',
    currentValue: 'high',
    choices: [
      { value: 'low', name: 'Low' },
      { value: 'high', name: 'High' },
    ],
  },
];

const shown = (
  config: AcpConfigOptionView[],
  usage: AgentUsage | null = null,
  commands: AcpCommandView[] = [],
) => {
  useAgentSessions.setState({
    sessions: [
      { id: 1, repo: '/a', title: 'claude', status: 'ready', config, commands, usage },
    ],
    activeByRepo: { '/a': 1 },
  });
  return render(<AgentChips id={1} repo="/a" />);
};

const RESETS_AT = 1786116000;

const FIVE_HOUR: AcpRateLimitView = {
  kind: 'five_hour',
  resetsAt: RESETS_AT,
  usedShare: null,
  status: 'allowed',
};

const usageWithLimits = (limits: AcpRateLimitView[]): AgentUsage => ({
  used: 40000,
  size: 200000,
  cost: null,
  currency: null,
  limits,
});

beforeEach(() => {
  vi.clearAllMocks();
  useAgentSessions.setState({ sessions: [], activeByRepo: {} });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('чипы управления агентской сессией', () => {
  it('чипы рисуются из объявленных агентом опций, а не из своего списка', () => {
    shown(OPTIONS);
    expect(screen.getByText('Fable 5'), 'модель названа так, как её назвал агент').toBeTruthy();
    expect(
      screen.getByText('High'),
      'эффорт объявлен агентом категорией thought_level',
    ).toBeTruthy();
    expect(screen.getByText('Ask'), 'режим объявлен агентом категорией mode').toBeTruthy();
  });

  it('режим стоит слева от ввода, остальные опции справа', () => {
    const { container } = shown(OPTIONS);
    expect(
      [...container.querySelectorAll('button')]
        .filter((button) => button.getAttribute('aria-label') !== 'Context window')
        .map((button) => button.textContent),
      'режим — слева от ввода, модель и эффорт — справа, как в самом Claude Code',
    ).toEqual(['Ask', 'Fable 5', 'High']);
  });

  it('выбор в чипе уходит агенту как смена опции', async () => {
    shown(OPTIONS);
    fireEvent.pointerDown(screen.getByText('Fable 5'));
    fireEvent.click(await screen.findByText('Opus 5'));
    expect(
      vi.mocked(acpSetConfig),
      'смена модели — это протокольная опция, а не слэш-команда',
    ).toHaveBeenCalledWith(1, 'model', 'opus');
  });

  it('без объявленных опций остаётся только кольцо расхода', () => {
    const { container } = shown([]);
    const labels = [...container.querySelectorAll('button')].map((button) =>
      button.getAttribute('aria-label'),
    );
    expect(labels, 'агент без опций не получает выдуманных чипов, но расход виден всегда').toEqual([
      'Context window',
    ]);
  });

  it('расход контекста виден кольцом с долей в подсказке', () => {
    shown([], { used: 40000, size: 200000, cost: null, currency: null, limits: [] });
    expect(
      screen.getByTitle('Context window 20%'),
      'доля окна контекста считается из used и size',
    ).toBeTruthy();
  });

  it('подробности расхода называют токены и потраченное', async () => {
    shown([], { used: 40000, size: 200000, cost: 0.2195405, currency: 'USD', limits: [] });
    fireEvent.click(screen.getByLabelText('Context window'));
    expect(
      await screen.findByText('40,000 of 200,000 tokens'),
      'за долей стоят настоящие числа агента',
    ).toBeTruthy();
    expect(
      screen.getByText('Spent $0.22'),
      'стоимость показывается в валюте агента, а не в нашей',
    ).toBeTruthy();
  });

  it('лимиты плана названы человеком и говорят, когда сбросятся', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date((RESETS_AT - 3 * 3600) * 1000));
    shown([], usageWithLimits([FIVE_HOUR]));
    fireEvent.click(screen.getByLabelText('Context window'));
    expect(
      await screen.findByText('5-hour limit'),
      'вид лимита переводится по kind, а не показывается кодом',
    ).toBeTruthy();
    expect(
      screen.getByText('resets in 3 hours'),
      'до сброса три часа, и это считается от resetsAt, а не выдумывается',
    ).toBeTruthy();
    expect(
      screen.getByText('Allowed'),
      'статус лимита отвечает на вопрос, работает ли ещё аккаунт',
    ).toBeTruthy();
  });

  it('незнакомый вид лимита виден как есть, а не пропадает', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date((RESETS_AT - 3 * 3600) * 1000));
    shown([], usageWithLimits([{ ...FIVE_HOUR, kind: 'seven_day' }]));
    fireEvent.click(screen.getByLabelText('Context window'));
    expect(
      await screen.findByText('seven_day'),
      'виды лимитов объявляет Claude, и новый обязан доехать до экрана без правки кода',
    ).toBeTruthy();
  });

  it('доля израсходованного рисуется полосой только тогда, когда агент её прислал', async () => {
    const { rerender } = shown([], usageWithLimits([FIVE_HOUR]));
    fireEvent.click(screen.getByLabelText('Context window'));
    await screen.findByText('5-hour limit');
    expect(
      screen.getAllByRole('progressbar').length,
      'без доли полоса лимита не рисуется: пустая полоса читается как «ничего не потрачено»',
    ).toBe(1);
    useAgentSessions.setState({
      sessions: [
        {
          id: 1,
          repo: '/a',
          title: 'claude',
          status: 'ready',
          config: [],
          commands: [],
          usage: usageWithLimits([{ ...FIVE_HOUR, usedShare: 0.42 }]),
        },
      ],
    });
    rerender(<AgentChips id={1} repo="/a" />);
    expect(
      screen.getAllByRole('progressbar').length,
      'присланная доля становится полосой рядом с окном контекста',
    ).toBe(2);
  });
});

const EFFORT: AcpConfigOptionView = {
  id: 'effort',
  name: 'Effort',
  description: null,
  category: 'thought_level',
  currentValue: 'high',
  choices: [
    { value: 'low', name: 'Low' },
    { value: 'medium', name: 'Medium' },
    { value: 'high', name: 'High' },
    { value: 'max', name: 'Max' },
  ],
};

describe('эффорт выбирается слайдером', () => {
  beforeEach(() => vi.clearAllMocks());

  it('шкала подписана быстрее и умнее, ползунок стоит на текущем значении', async () => {
    shown([EFFORT], null);
    fireEvent.click(screen.getByLabelText('Effort'));
    expect(await screen.findByText('Faster'), 'шкала объясняет, чем платишь за качество').toBeTruthy();
    expect(screen.getByText('Smarter')).toBeTruthy();
    expect(
      screen.getByRole('slider').getAttribute('aria-valuenow'),
      'ползунок стоит на объявленном агентом текущем значении',
    ).toBe('2');
  });

  it('сдвиг ползунка отправляет агенту соседнее значение', async () => {
    shown([EFFORT], null);
    fireEvent.click(screen.getByLabelText('Effort'));
    const slider = await screen.findByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(
      vi.mocked(acpSetConfig),
      'шаг вправо — это следующее значение из списка агента, а не выдуманное число',
    ).toHaveBeenCalledWith(1, 'effort', 'max');
  });
});

describe('кольцо расхода до первого хода', () => {
  it('стоит на месте, пока агент ещё ничего не потратил', () => {
    shown([], null);
    expect(
      screen.getByLabelText('Context window'),
      'кольцо — постоянная часть панели: пропадающий элемент читается как поломка',
    ).toBeTruthy();
  });

  it('пустое окно контекста показывает ноль, а не выдуманную долю', async () => {
    shown([], null);
    fireEvent.click(screen.getByLabelText('Context window'));
    expect(
      await screen.findByText('0 of 0 tokens'),
      'до первого usage_update числа честно нулевые',
    ).toBeTruthy();
  });
});

const USAGE_COMMAND: AcpCommandView = {
  name: 'usage',
  description: "Show session cost, plan usage, and what's contributing to your limits",
  hint: null,
};

describe('полный расклад лимитов спрашивается у агента', () => {
  it('строка ведёт к его же команде, а не к нашим выдуманным числам', async () => {
    shown([], null, [USAGE_COMMAND]);
    fireEvent.click(screen.getByLabelText('Context window'));
    fireEvent.click(await screen.findByText('Plan usage limits'));
    expect(
      vi.mocked(sendPrompt),
      'проценты и недельные лимиты знает только сам Claude — спрашиваем его',
    ).toHaveBeenCalledWith(1, '/usage');
  });

  it('без такой команды у агента строки нет', async () => {
    shown([], null, []);
    fireEvent.click(screen.getByLabelText('Context window'));
    expect(
      screen.queryByText('Plan usage limits'),
      'кнопка на несуществующую команду — обещание, которого мы не сдержим',
    ).toBeNull();
  });
});
