import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RELEASES } from '@/entities/changelog';
import { ChangelogView } from './ChangelogView';
import '../i18n';

describe('release notes tab', () => {
  it('lists every released version', () => {
    render(<ChangelogView />);
    expect(
      RELEASES.length,
      'the project file is not empty, otherwise the tab has nothing to show',
    ).toBeGreaterThan(0);
    for (const release of RELEASES) {
      expect(screen.getByText(`Version ${release.version}`)).toBeTruthy();
    }
  });

  it('marks the installed version and renders its markdown', () => {
    render(<ChangelogView />);
    expect(
      screen.getByText('installed'),
      'without the mark it is unclear which entry of the list is already installed',
    ).toBeTruthy();
    const current = RELEASES.find((release) => release.version === __APP_VERSION__);
    const bullet = current?.body.split('\n').find((line) => line.startsWith('- ')) ?? '';
    expect(
      screen.getByText(bullet.replace(/^- /, ''), { exact: false }),
      'the lines of a section reach the screen through Prose',
    ).toBeTruthy();

    const heading = current?.body.split('\n').find((line) => line.startsWith('### ')) ?? '';
    const installed = screen.getByText('installed').closest('section') as HTMLElement;
    expect(
      within(installed).getByRole('heading', { name: heading.replace(/^### /, '') }),
      'the sub-sections inside a version stay headings instead of hashes in the text',
    ).toBeTruthy();
  });
});
