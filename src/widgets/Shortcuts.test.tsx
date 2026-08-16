import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import { COMMANDS } from '@/features/keyboard';
import { Shortcuts } from './Shortcuts';

const draw = () => render(<Shortcuts open onOpenChange={() => {}} />);

const filter = () => screen.getByPlaceholderText('Filter shortcuts');

describe('окно горячих клавиш', () => {
  it('перечисляет весь реестр, чтобы справка не расходилась с кодом', () => {
    draw();

    expect(screen.getByText('Stage current file')).toBeTruthy();
    expect(screen.getByText('Toggle terminal panel')).toBeTruthy();
    expect(
      document.querySelectorAll('[data-slot="shortcut"]').length,
      'в справке ровно столько строк, сколько команд в реестре',
    ).toBe(COMMANDS.length);
  });

  it('фильтр оставляет подходящие команды и убирает остальные', () => {
    draw();

    fireEvent.change(filter(), { target: { value: 'stage' } });

    expect(
      screen.getByText('Stage current file'),
      'по слову stage команда обязана остаться',
    ).toBeTruthy();
    expect(screen.queryByText('Toggle terminal panel'), 'чужая команда уходит').toBeNull();
  });

  it('пустая группа не оставляет за собой заголовок', () => {
    draw();

    fireEvent.change(filter(), { target: { value: 'zoom' } });

    expect(screen.getByText('Increase zoom')).toBeTruthy();
    expect(screen.queryByText('Navigation'), 'заголовок без строк — мусор на экране').toBeNull();
  });

  it('когда не совпало ничего, окно говорит об этом', () => {
    draw();

    fireEvent.change(filter(), { target: { value: 'нет такой команды' } });

    expect(screen.getByText('Nothing matches')).toBeTruthy();
  });

  it('высота окна не зависит от фильтра, иначе центрированный диалог прыгает', () => {
    draw();

    const panel = screen.getByRole('dialog');
    const sized = panel.className.split(' ').filter((part) => part.startsWith('h-'));
    expect(sized.length, 'высота задана прямо, а не пределом по содержимому').toBe(1);
    expect(
      panel.className.includes('max-h-'),
      'предел по содержимому дал бы разную высоту при разном числе строк',
    ).toBe(false);
  });

  it('заголовок и поиск лежат вне прокручиваемой части, поэтому не уезжают', () => {
    draw();

    const scroller = document.querySelector('.overflow-y-auto') as HTMLElement;
    expect(scroller, 'прокручивается тело списка').toBeTruthy();
    expect(scroller.contains(filter()), 'поиск не должен уезжать вместе со списком').toBe(false);
    expect(
      scroller.contains(screen.getByText('Keyboard Shortcuts')),
      'заголовок не должен уезжать вместе со списком',
    ).toBe(false);
  });
});
