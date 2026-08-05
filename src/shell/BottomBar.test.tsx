import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomBar } from './BottomBar';
import '../i18n';

describe('нижняя полоса', () => {
  it('без обновления показывает только версию', () => {
    render(<BottomBar ready={null} onRestart={() => {}} />);
    expect(
      screen.queryByRole('button'),
      'кнопке нечего предлагать, пока обновление не скачано',
    ).toBeNull();
    expect(screen.getByText(__APP_VERSION__)).toBeTruthy();
  });

  it('со скачанным обновлением предлагает перезапуск и зовёт его по клику', () => {
    const restart = vi.fn();
    render(<BottomBar ready="1.0.2" onRestart={restart} />);
    const button = screen.getByRole('button');
    expect(button.textContent, 'кнопка называет версию, ради которой перезапуск').toContain(
      '1.0.2',
    );
    fireEvent.click(button);
    expect(restart, 'клик и есть перезапуск, второго шага нет').toHaveBeenCalledOnce();
  });
});
