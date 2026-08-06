import { fireEvent, render as bare, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { vi } from 'vitest';

vi.mock('@/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setAutofetchMinutes: vi.fn(() => Promise.resolve()),
  aiDetectServer: vi.fn(() =>
    Promise.resolve({ provider: 'lmstudio', models: ['qwen2.5-coder', 'llama3.1'] }),
  ),
  onHostConnected: vi.fn(() => Promise.resolve(() => {})),
  onHostFailed: vi.fn(() => Promise.resolve(() => {})),
}));
import * as ipc from '@/ipc';
import { Settings } from './Settings';

const render = (ui: React.ReactElement) => bare(<TooltipProvider>{ui}</TooltipProvider>);
import '../i18n';

const shown = {
  open: true,
  account: null,
  collapsed: false,
  zoom: 1,
  onZoom: () => {},
  compact: false,
  onCompact: () => {},
  onToggle: () => {},
  onDisconnected: () => {},
};

describe('страница настроек', () => {
  beforeEach(() => localStorage.clear());

  it('закрытая страница не занимает ни пикселя', () => {
    const { container } = render(<Settings {...shown} open={false} />);
    expect(container.innerHTML, 'закрытые настройки — это отсутствие, а не display:none').toBe('');
  });

  it('строки General пишут в те же префы, что живое поведение', () => {
    render(<Settings {...shown} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember open tabs' }));
    expect(
      localStorage.getItem('gitspy.session.remember'),
      'галка «помнить вкладки» и восстановление сессии обязаны читать один преф',
    ).toBe('false');

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Auto-fetch interval' }), {
      target: { value: '7' },
    });
    expect(localStorage.getItem('gitspy.autofetch.minutes')).toBe('7');
  });

  it('слева секции, выбор секции меняет содержимое и шапку', () => {
    render(<Settings {...shown} />);
    expect(screen.getByRole('button', { name: 'General' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
    expect(
      screen.getByRole('button', { name: /Connect GitHub/ }),
      'секция интеграций несёт живое подключение GitHub, а не заглушку',
    ).toBeTruthy();
    expect(
      screen.getByRole('banner').textContent,
      'ViewBar-шапка называет открытую секцию',
    ).toContain('Integrations');
  });
});

describe('секция AI', () => {
  beforeEach(() => localStorage.clear());

  it('проверка адреса сама определяет провайдера и выбирает первую модель', async () => {
    render(<Settings {...shown} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI commit message' }));

    fireEvent.click(screen.getByRole('button', { name: 'Load models' }));

    expect(
      await screen.findByRole('button', { name: 'qwen2.5-coder' }),
      'первая модель из ответа сервера выбирается сама',
    ).toBeTruthy();
    expect(
      localStorage.getItem('gitspy.ai.provider'),
      'провайдера называет сервер, а не пользователь',
    ).toBe('"lmstudio"');
    expect(
      localStorage.getItem('gitspy.ai.model'),
      'выбор модели пишется в преф, который читает кнопка генерации',
    ).toBe('"qwen2.5-coder"');
    expect(
      screen.getByText('Found LM Studio at this address.'),
      'найденный провайдер назван человеку',
    ).toBeTruthy();
  });

  it('пустой адрес пробует оба локальных порта по очереди', async () => {
    vi.mocked(ipc.aiDetectServer)
      .mockClear()
      .mockRejectedValueOnce(new Error('dead'))
      .mockResolvedValueOnce({ provider: 'lmstudio', models: ['llama3.1'] });
    render(<Settings {...shown} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI commit message' }));

    fireEvent.click(screen.getByRole('button', { name: 'Load models' }));

    expect(
      await screen.findByRole('button', { name: 'llama3.1' }),
      'второй порт спасает, когда первый молчит',
    ).toBeTruthy();
    expect(vi.mocked(ipc.aiDetectServer).mock.calls.map((call) => call[0])).toEqual([
      'http://localhost:11434',
      'http://localhost:1234',
    ]);
  });
});

describe('секция Interface', () => {
  beforeEach(() => localStorage.clear());

  it('минимапа и колонки пишут в те же хранилища, что живой граф', () => {
    render(<Settings {...shown} />);
    fireEvent.click(screen.getByRole('button', { name: 'Interface' }));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Graph minimap' }));
    expect(
      localStorage.getItem('gitspy.graph.minimap'),
      'граф читает этот преф при маунте — иначе галка была бы бутафорией',
    ).toBe('false');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Branch / Tag' }));
    expect(
      localStorage.getItem('gitspy.columns.hidden'),
      'видимость колонок делит хранилище с контекстным меню шапки',
    ).toContain('branchTag');
  });
});
