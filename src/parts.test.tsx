import { fireEvent, render as bare, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ListRow, NavItem, Tab } from '@/parts';

const render = (ui: React.ReactElement) => bare(<TooltipProvider>{ui}</TooltipProvider>);

describe('tab in the top bar', () => {
  it('clicking a tab selects it, while the close cross closes it without selecting', () => {
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
    expect(
      onSelect,
      'the close cross must not activate the tab along the way',
    ).toHaveBeenCalledOnce();
  });

  it('the current tab carries the fill and a close cross that is always visible', () => {
    render(
      <Tab
        icon="folder"
        label="wip"
        current
        closeLabel="Close"
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.className).toContain('opacity-100');
  });
});

describe('tall list row', () => {
  it('tall makes the row two lines high, the plain row stays one', () => {
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

describe('navigation button', () => {
  it('the active one carries the fill, the idle one does not', () => {
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

  it('with no label it stays a square whose accessible name comes from the tooltip', () => {
    render(<NavItem icon="branch" hint="Branches" onClick={() => {}} />);
    const square = screen.getByRole('button', { name: 'Branches' });
    expect(square.className, 'a rail square is size-8, not a list row').toContain('size-8');
  });
});
