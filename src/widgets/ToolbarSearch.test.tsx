import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/shared/api/ipc', () => ({
  foundCommits: vi.fn(),
}));

import '@/shared/config/i18n';
import { TooltipProvider } from '@/shared/ui/tooltip';
import * as ipc from '@/shared/api/ipc';
import { Toolbar } from './Toolbar';

const draw = () =>
  render(
    <TooltipProvider>
      <div>
        <button>elsewhere</button>
        <Toolbar
          repo="/r"
          tree={null}
          onRun={() => {}}
          onAsk={() => {}}
          onTerminal={() => {}}
          search="DOM"
          found={[3, 7]}
          at={0}
          focusAt={0}
          onSearch={() => {}}
          onStep={() => {}}
          onPickFound={() => {}}
        />
      </div>
    </TooltipProvider>,
  );

const field = () => screen.getByPlaceholderText(/search commits/i);
const results = () => screen.queryByText('Scope Fragment');

beforeEach(() => {
  vi.mocked(ipc.foundCommits).mockResolvedValue([
    { index: 3, hash: 'abcdef0', subject: 'Scope Fragment', author: 'jackpope', time: 1 },
    { index: 7, hash: '1234567', subject: 'Fix dispatchEvent', author: 'jackpope', time: 2 },
  ]);
});

describe('the search results under the field', () => {
  it('open on focus and close on a click anywhere outside them', async () => {
    draw();
    await act(async () => fireEvent.focus(field()));
    await waitFor(() => expect(results(), 'focus with a query lists the matches').toBeTruthy());

    fireEvent.pointerDown(screen.getByText('elsewhere'));
    expect(results(), 'a click outside dismisses the list, no Escape needed').toBeNull();

    await act(async () => fireEvent.focus(field()));
    await waitFor(() => expect(results(), 'coming back to the field brings it back').toBeTruthy());
  });

  it('a click inside the list does not dismiss it before the pick lands', async () => {
    draw();
    await act(async () => fireEvent.focus(field()));
    await waitFor(() => expect(results()).toBeTruthy());

    fireEvent.pointerDown(screen.getByText('Fix dispatchEvent'));
    expect(results(), 'the pointer is still inside the popover').toBeTruthy();
  });

  it('Escape and Tab close it from the keyboard', async () => {
    draw();
    await act(async () => fireEvent.focus(field()));
    await waitFor(() => expect(results()).toBeTruthy());

    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(results()).toBeNull();

    await act(async () => fireEvent.focus(field()));
    await waitFor(() => expect(results()).toBeTruthy());
    fireEvent.keyDown(field(), { key: 'Tab' });
    expect(results()).toBeNull();
  });
});
