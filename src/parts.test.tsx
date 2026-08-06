import { fireEvent, render as bare, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ListRow, NavItem, Tab } from '@/parts';

const render = (ui: React.ReactElement) =>
  bare(<TooltipProvider>{ui}</TooltipProvider>);

describe('таб верхней полосы', () => {
  it('клик по табу выбирает его, крестик закрывает и не выбирает', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <Tab
        icon="folder"
        label="react"
        current={false}
        closeLabel="Close"
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText('react'));
    expect(onSelect).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect, 'крестик не должен заодно активировать таб').toHaveBeenCalledOnce();
  });

  it('активный таб несёт заливку и всегда видимый крестик', () => {
    render(
      <Tab icon="folder" label="wip" current closeLabel="Close" onSelect={() => {}} onClose={() => {}} />,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.className).toContain('opacity-100');
  });
});

describe('высокая строка списка', () => {
  it('tall двухстрочная, обычная нет', () => {
    const { rerender } = bare(<ListRow onClick={() => {}}>x</ListRow>);
    expect(screen.getByRole('button').className).toContain('h-8');
    rerender(
      <ListRow tall onClick={() => {}}>
        x
      </ListRow>,
    );
    expect(screen.getByRole('button').className).toContain('h-11');
  });
});

describe('кнопка навигации', () => {
  it('активная несёт заливку, покойная — нет', () => {
    const { rerender } = render(<NavItem icon="branch" label="Local" onClick={() => {}} />);
    const idle = screen.getByRole('button', { name: 'Local' });
    expect(idle.className).not.toContain('bg-fill-2');
    rerender(
      <TooltipProvider>
        <NavItem icon="branch" label="Local" active onClick={() => {}} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Local' }).className).toContain('bg-fill-2');
  });

  it('без подписи остаётся квадратом с доступным именем из подсказки', () => {
    render(<NavItem icon="branch" hint="Branches" onClick={() => {}} />);
    const square = screen.getByRole('button', { name: 'Branches' });
    expect(square.className, 'квадрат рейла — size-8, не строка').toContain('size-8');
  });
});
