import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/shared/config/i18n';
import { TooltipProvider } from '@/shared/ui/tooltip';
import type { RefView } from '@/shared/api/types';
import { Breadcrumbs } from './Breadcrumbs';

const ref = (name: string, commit: number, isHead = false): RefView => ({
  name,
  kind: 'localBranch',
  commit,
  oid: `${commit}`,
  isHead,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
});

const draw = () => {
  const onCheckout = vi.fn();
  const onReveal = vi.fn();
  render(
    <TooltipProvider>
      <Breadcrumbs
        repoPath="/r"
        repoName="react"
        openPaths={[]}
        recent={[]}
        refs={[ref('main', 0, true), ref('feature', 7)]}
        worktrees={[]}
        currentBranch="main"
        onOpenPath={vi.fn()}
        onStart={vi.fn()}
        onCheckout={onCheckout}
        onReveal={onReveal}
      />
    </TooltipProvider>,
  );
  return { onCheckout, onReveal };
};

const openBranches = () =>
  fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('main'))!);

describe('picking a branch in the crumb menu', () => {
  it('reveals its commit in the graph and checks it out', () => {
    const { onCheckout, onReveal } = draw();
    openBranches();
    fireEvent.click(screen.getByText('feature'));

    expect(
      onReveal,
      'the graph jumps to the branch, as a click in the sidebar does',
    ).toHaveBeenCalledWith(7);
    expect(onCheckout).toHaveBeenCalledWith(expect.objectContaining({ name: 'feature' }));
  });

  it('on the current branch it only reveals: there is nothing to check out', () => {
    const { onCheckout, onReveal } = draw();
    openBranches();
    fireEvent.click(screen.getAllByText('main').at(-1)!);

    expect(onReveal).toHaveBeenCalledWith(0);
    expect(onCheckout).not.toHaveBeenCalled();
  });
});
