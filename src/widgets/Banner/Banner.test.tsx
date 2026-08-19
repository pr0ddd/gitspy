import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Banner } from './index';
import '@/shared/config/i18n';

describe('the startup banner', () => {
  it('shows the icon and the name and no status while nothing is updating', () => {
    render(<Banner update={null} />);

    expect(
      document.querySelector('svg.animate-orbit'),
      'the card the user stares at while the app boots is the mark, and the mark turns',
    ).toBeTruthy();
    expect(screen.getByText('gitspy'), 'a nameless card belongs to no application').toBeTruthy();
    expect(
      screen.queryByRole('progressbar'),
      'a bar with nothing behind it invents an update that is not running',
    ).toBeNull();
  });

  it('shows the version and the progress while an update is running', () => {
    render(<Banner update={{ phase: 'downloading', version: '1.3.0', percent: 40 }} />);

    expect(
      screen.getByText('Updating to 1.3.0'),
      'a wait without a reason and a version is indistinguishable from a hang',
    ).toBeTruthy();
    expect(
      document.querySelector<HTMLElement>('[data-slot="progress-indicator"]')?.style.transform,
      'forty per cent of the bar is filled and the rest is shifted out of sight, so the bar follows the update instead of a shape of its own',
    ).toBe('translateX(-60%)');
  });
});
