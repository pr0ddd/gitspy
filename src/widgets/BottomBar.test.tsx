import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { BottomBar } from './BottomBar';
import '@/shared/config/i18n';

const draw = (bar: React.ReactElement) => render(<TooltipProvider>{bar}</TooltipProvider>);

const quiet = {
  zoom: 1,
  onZoom: () => {},
  ready: null,
  onRestart: () => {},
  onShortcuts: () => {},
  onChangelog: () => {},
};

describe('bottom bar', () => {
  it('shows the version and offers no restart while no update is ready', () => {
    draw(<BottomBar {...quiet} />);
    expect(
      screen.queryByText(/Restart to update/),
      'the button has nothing to offer until an update is downloaded',
    ).toBeNull();
    expect(screen.getByText(__APP_VERSION__)).toBeTruthy();
  });

  it('offers a restart once an update is downloaded and runs it on click', () => {
    const restart = vi.fn();
    draw(<BottomBar {...quiet} ready="1.0.2" onRestart={restart} />);
    const button = screen.getByText(/Restart to update/);
    expect(button.textContent, 'the button names the version the restart is for').toContain(
      '1.0.2',
    );
    fireEvent.click(button);
    expect(
      restart,
      'the click is the restart itself, there is no second step',
    ).toHaveBeenCalledOnce();
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
