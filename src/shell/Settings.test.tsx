import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from './Settings';
import '../i18n';

const shown = {
  open: true,
  account: null,
  onOpenChange: () => {},
  onDisconnected: () => {},
};

describe('страница настроек', () => {
  beforeEach(() => localStorage.clear());

  it('закрытая страница не занимает ни пикселя', () => {
    const { container } = render(<Settings {...shown} open={false} />);
    expect(container.innerHTML, 'закрытые настройки — это отсутствие, а не display:none').toBe('');
  });

  it('слева секции, выбор секции меняет содержимое', () => {
    render(<Settings {...shown} />);
    expect(screen.getByRole('button', { name: 'General' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
    expect(
      screen.getByRole('button', { name: /Connect GitHub/ }),
      'секция интеграций несёт живое подключение GitHub, а не заглушку',
    ).toBeTruthy();
  });

  it('кнопка выхода закрывает страницу', () => {
    const onOpenChange = vi.fn();
    render(<Settings {...shown} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit settings' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
