import { fireEvent, render as bare, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
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
