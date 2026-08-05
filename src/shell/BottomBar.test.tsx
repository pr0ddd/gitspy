import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomBar } from './BottomBar';
import '../i18n';

const quiet = { zoom: 1, onZoom: () => {}, ready: null, onRestart: () => {} };

describe('нижняя полоса', () => {
  it('без обновления показывает версию и не предлагает перезапуск', () => {
    render(<BottomBar {...quiet} />);
    expect(
      screen.queryByText(/Restart to update/),
      'кнопке нечего предлагать, пока обновление не скачано',
    ).toBeNull();
    expect(screen.getByText(__APP_VERSION__)).toBeTruthy();
  });

  it('со скачанным обновлением предлагает перезапуск и зовёт его по клику', () => {
    const restart = vi.fn();
    render(<BottomBar {...quiet} ready="1.0.2" onRestart={restart} />);
    const button = screen.getByText(/Restart to update/);
    expect(button.textContent, 'кнопка называет версию, ради которой перезапуск').toContain(
      '1.0.2',
    );
    fireEvent.click(button);
    expect(restart, 'клик и есть перезапуск, второго шага нет').toHaveBeenCalledOnce();
  });

  it('плюс и минус шагают по лестнице масштаба', () => {
    const onZoom = vi.fn();
    render(<BottomBar {...quiet} zoom={1.25} onZoom={onZoom} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(onZoom, 'плюс — следующая ступень').toHaveBeenLastCalledWith(1.5);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(onZoom, 'минус — предыдущая ступень').toHaveBeenLastCalledWith(1.1);
  });

  it('клик по проценту открывает лестницу, выбор ступени применяет её', () => {
    const onZoom = vi.fn();
    render(<BottomBar {...quiet} zoom={2} onZoom={onZoom} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Zoom level' }));
    const step = screen.getByRole('menuitemradio', { name: '150%' });
    fireEvent.click(step);
    expect(onZoom, 'ступень из меню применяется как есть').toHaveBeenLastCalledWith(1.5);
  });
});
