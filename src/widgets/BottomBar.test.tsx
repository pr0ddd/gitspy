import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { BottomBar } from './BottomBar';
import '@/shared/config/i18n';

const draw = (bar: React.ReactElement) => render(<TooltipProvider>{bar}</TooltipProvider>);

const quiet = {
  zoom: 1,
  onZoom: () => {},
  update: null,
  onUpdate: () => {},
  onShortcuts: () => {},
  onChangelog: () => {},
};

describe('bottom bar', () => {
  it('shows the version and offers no update while none is known', () => {
    draw(<BottomBar {...quiet} />);
    expect(
      screen.queryByText(/Update to/),
      'the button has nothing to offer until a newer version has been seen',
    ).toBeNull();
    expect(screen.getByText(__APP_VERSION__)).toBeTruthy();
  });

  it('offers the update once one is known and hands the click on', () => {
    const take = vi.fn();
    draw(<BottomBar {...quiet} update={{ version: '1.0.2', installable: true }} onUpdate={take} />);
    const button = screen.getByText(/Update to/);
    expect(button.textContent, 'the button names the version it offers').toContain('1.0.2');
    fireEvent.click(button);
    expect(take, 'the click is the update itself, there is no second step').toHaveBeenCalledOnce();
  });

  it('the icon next to the version opens the changelog', () => {
    const changelog = vi.fn();
    draw(<BottomBar {...quiet} onChangelog={changelog} />);
    fireEvent.click(screen.getByRole('button', { name: "What's new" }));
    expect(
      changelog,
      'the click on the icon is the opening itself, there is no second step',
    ).toHaveBeenCalledOnce();
  });

  it('plus and minus step through the zoom ladder', () => {
    const onZoom = vi.fn();
    draw(<BottomBar {...quiet} zoom={1.25} onZoom={onZoom} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(onZoom, 'plus goes to the next step of the ladder').toHaveBeenLastCalledWith(1.5);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(onZoom, 'minus goes to the previous step of the ladder').toHaveBeenLastCalledWith(1.1);
  });

  it('clicking the percentage opens the ladder and picking a step applies it', () => {
    const onZoom = vi.fn();
    draw(<BottomBar {...quiet} zoom={2} onZoom={onZoom} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Zoom level' }));
    const step = screen.getByRole('menuitemradio', { name: '150%' });
    fireEvent.click(step);
    expect(onZoom, 'the step picked from the menu is applied as it is').toHaveBeenLastCalledWith(
      1.5,
    );
  });
});
