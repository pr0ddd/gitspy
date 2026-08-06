import { fireEvent, render as bare, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { vi } from 'vitest';

vi.mock('@/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setAutofetchMinutes: vi.fn(() => Promise.resolve()),
  aiListModels: vi.fn(() => Promise.resolve(['qwen2.5-coder', 'llama3.1'])),
}));
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

  it('провайдер задаёт плейсхолдер адреса, проверка наполняет список моделей', async () => {
    render(<Settings {...shown} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI commit message' }));

    expect(
      screen.getByPlaceholderText('http://localhost:11434'),
      'по умолчанию провайдер Ollama со своим портом',
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Load models' }));
    expect(
      await screen.findByRole('button', { name: 'qwen2.5-coder' }),
      'первая модель из ответа сервера выбирается сама',
    ).toBeTruthy();
    expect(
      localStorage.getItem('gitspy.ai.model'),
      'выбор модели пишется в преф, который читает кнопка генерации',
    ).toBe('"qwen2.5-coder"');
  });

  it('смена провайдера сбрасывает модель и меняет плейсхолдер', async () => {
    localStorage.setItem('gitspy.ai.model', '"qwen2.5-coder"');
    render(<Settings {...shown} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI commit message' }));

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Ollama' }),
      { button: 0, ctrlKey: false, pointerId: 1 },
    );
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'LM Studio' }));

    expect(
      screen.getByPlaceholderText('http://localhost:1234'),
      'плейсхолдер следует за провайдером',
    ).toBeTruthy();
    expect(
      localStorage.getItem('gitspy.ai.model'),
      'список моделей принадлежит серверу: чужая модель не переживает смену провайдера',
    ).toBe('""');
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
