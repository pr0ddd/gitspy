import { fireEvent, render as bare, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { vi } from 'vitest';

vi.mock('@/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setAutofetchMinutes: vi.fn(() => Promise.resolve()),
}));
import { Settings } from './Settings';

const render = (ui: React.ReactElement) => bare(<TooltipProvider>{ui}</TooltipProvider>);
import '../i18n';

const shown = {
  open: true,
  account: null,
  collapsed: false,
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
