import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import { COMMANDS } from '@/features/keyboard';
import { Shortcuts } from './Shortcuts';

const draw = () => render(<Shortcuts open onOpenChange={() => {}} />);

const filter = () => screen.getByPlaceholderText('Filter shortcuts');

describe('the keyboard shortcuts dialog', () => {
  it('lists the whole registry, so the help never drifts away from the code', () => {
    draw();

    expect(screen.getByText('Stage current file')).toBeTruthy();
    expect(screen.getByText('Toggle terminal panel')).toBeTruthy();
    expect(
      document.querySelectorAll('[data-slot="shortcut"]').length,
      'the help has exactly as many rows as there are commands in the registry',
    ).toBe(COMMANDS.length);
  });

  it('the filter keeps the matching commands and removes the rest', () => {
    draw();

    fireEvent.change(filter(), { target: { value: 'stage' } });

    expect(
      screen.getByText('Stage current file'),
      'the command matching the word stage must stay',
    ).toBeTruthy();
    expect(
      screen.queryByText('Toggle terminal panel'),
      'an unrelated command goes away',
    ).toBeNull();
  });

  it('an emptied group leaves no heading behind', () => {
    draw();

    fireEvent.change(filter(), { target: { value: 'zoom' } });

    expect(screen.getByText('Increase zoom')).toBeTruthy();
    expect(
      screen.queryByText('Navigation'),
      'a heading with no rows is litter on screen',
    ).toBeNull();
  });

  it('when nothing matched, the dialog says so', () => {
    draw();

    fireEvent.change(filter(), { target: { value: 'no such command' } });

    expect(screen.getByText('Nothing matches')).toBeTruthy();
  });

  it('the dialog height does not depend on the filter, otherwise the centred dialog jumps', () => {
    draw();

    const panel = screen.getByRole('dialog');
    const sized = panel.className.split(' ').filter((part) => part.startsWith('h-'));
    expect(sized.length, 'the height is set outright, not as a cap over the content').toBe(1);
    expect(
      panel.className.includes('max-h-'),
      'a cap over the content would give a different height for a different number of rows',
    ).toBe(false);
  });

  it('the title and the search box live outside the scrolling part, so they never scroll away', () => {
    draw();

    const scroller = document.querySelector('.overflow-y-auto') as HTMLElement;
    expect(scroller, 'it is the body of the list that scrolls').toBeTruthy();
    expect(scroller.contains(filter()), 'the search box must not scroll away with the list').toBe(
      false,
    );
    expect(
      scroller.contains(screen.getByText('Keyboard Shortcuts')),
      'the title must not scroll away with the list',
    ).toBe(false);
  });
});
