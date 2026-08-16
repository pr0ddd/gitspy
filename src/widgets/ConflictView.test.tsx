import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import '../i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { workStore } from '@/entities/repo';
import { ConflictView } from './ConflictView';
import * as ipc from '@/ipc';

vi.mock('@/ipc', () => ({
  conflictFile: vi.fn(),
  resolveConflict: vi.fn(),
}));

const MERGED = [
  'top();',
  '<<<<<<< HEAD',
  'ours();',
  '||||||| base',
  'base();',
  '=======',
  'theirs();',
  '>>>>>>> feature',
  'bottom();',
].join('\n');

const file = {
  base: 'top();\nbase();\nbottom();\n',
  ours: 'top();\nours();\nbottom();\n',
  theirs: 'top();\ntheirs();\nbottom();\n',
  merged: MERGED,
};

const draw = (onResolved: (tree: unknown) => void = () => {}) =>
  render(
    <TooltipProvider>
      <ConflictView
        repo="/r"
        path="greeting.ts"
        from="feature"
        into="main"
        onClose={() => {}}
        onResolved={onResolved}
      />
    </TooltipProvider>,
  );

const output = (view: ReturnType<typeof draw>) => within(view.getByRole('region'));

describe('resolving conflicts by picking lines', () => {
  beforeEach(() => {
    vi.mocked(ipc.conflictFile).mockResolvedValue(file as never);
    vi.mocked(ipc.resolveConflict).mockClear();
  });

  it('keeps the base in the output while nothing is picked, not either side', async () => {
    const view = draw();
    await waitFor(() => expect(view.getAllByText('top();').length).toBeGreaterThan(0));
    expect(output(view).queryByText('ours();')).toBeNull();
    expect(output(view).queryByText('theirs();')).toBeNull();
    expect(
      output(view).getByText('base();'),
      'an unresolved spot shows the common ancestor, the way GitKraken shows it in purple',
    ).toBeTruthy();
  });

  it('a click on the line itself takes it into the output, a click in the output removes it', async () => {
    const view = draw();
    await waitFor(() => expect(view.getAllByText('ours();').length).toBe(1));

    fireEvent.click(view.getByText('ours();'));
    expect(
      output(view).getByText('ours();'),
      'the whole line is the click target, not just the checkbox',
    ).toBeTruthy();

    fireEvent.click(output(view).getByText('ours();'));
    expect(output(view).queryByText('ours();')).toBeNull();
  });

  it('the checkbox on a line of a side puts that line into the output, a second click removes it', async () => {
    const view = draw();
    await waitFor(() => expect(view.getAllByText('ours();').length).toBe(1));

    const boxes = view.getAllByRole('checkbox');
    fireEvent.click(boxes[1]);
    expect(
      output(view).getByText('ours();'),
      'a picked line has to appear in the output',
    ).toBeTruthy();

    fireEvent.click(view.getAllByRole('checkbox')[1]);
    expect(output(view).queryByText('ours();')).toBeNull();
  });

  it('the checkbox in the header of a side takes all of its conflicting lines', async () => {
    const view = draw();
    await waitFor(() => expect(view.getAllByText('theirs();').length).toBe(1));

    fireEvent.click(view.getAllByRole('checkbox')[2]);
    expect(output(view).getByText('theirs();')).toBeTruthy();
  });

  it('saving sends exactly the assembled output and hands the working tree back up', async () => {
    const tree = { conflicts: 0 };
    vi.mocked(ipc.resolveConflict).mockResolvedValue(tree as never);
    let resolved: unknown = null;
    const view = draw((next) => (resolved = next));
    await waitFor(() => expect(view.getAllByText('ours();').length).toBe(1));

    fireEvent.click(view.getAllByRole('checkbox')[1]);
    fireEvent.click(view.getByRole('button', { name: /mark resolved/i }));

    await waitFor(() => expect(resolved).toBe(tree));
    expect(
      vi.mocked(ipc.resolveConflict).mock.calls[0],
      'what reaches the disk is exactly what the person assembled out of the lines',
    ).toEqual(['/r', 'greeting.ts', 'top();\nours();\nbottom();']);
  });

  it('holds the repository lane while the save is running', async () => {
    workStore.setState({ works: new Map() });
    vi.mocked(ipc.resolveConflict).mockReturnValue(new Promise(() => {}) as never);
    const view = draw();
    await waitFor(() => expect(view.getAllByText('ours();').length).toBe(1));

    fireEvent.click(view.getByRole('button', { name: /mark resolved/i }));

    await waitFor(() =>
      expect(
        workStore.getState().works.get('/r'),
        'a write to the working tree has to hold the lane of the repository',
      ).toEqual({ kind: 'resolveConflict', target: 'greeting.ts' }),
    );
    workStore.setState({ works: new Map() });
  });
});
