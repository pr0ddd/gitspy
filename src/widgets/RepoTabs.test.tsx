import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { newSession } from '@/entities/repo';
import { RepoTabs } from './RepoTabs';

const draw = (props: Partial<React.ComponentProps<typeof RepoTabs>> = {}) =>
  render(
    <TooltipProvider>
      <RepoTabs
        sessions={[{ ...newSession('/a'), name: 'a' }]}
        active={null}
        views={[]}
        view={null}
        onActivate={() => {}}
        onClose={() => {}}
        onStart={() => {}}
        onCloseStart={() => {}}
        onView={() => {}}
        onCloseView={() => {}}
        {...props}
      />
    </TooltipProvider>,
  );

describe('the tab strip while the start page is open', () => {
  it('shows a New tab entry next to the open repositories, and closing it goes back', () => {
    const onCloseStart = vi.fn();
    draw({ onCloseStart });

    expect(screen.getByText('New tab')).toBeTruthy();
    const closers = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closers[closers.length - 1]);
    expect(onCloseStart, 'the New tab is the last tab in the strip').toHaveBeenCalledOnce();
  });

  it('shows no New tab entry when the start page is the only thing there is', () => {
    draw({ sessions: [] });

    expect(screen.queryByText('New tab')).toBeNull();
  });

  it('shows no New tab entry while a repository is active', () => {
    draw({ active: '/a' });

    expect(screen.queryByText('New tab')).toBeNull();
  });
});
