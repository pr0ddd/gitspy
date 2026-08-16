import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetailsPane } from './DetailsPane';
import '@/shared/config/i18n';

describe('details pane', () => {
  it('keeps its own width and does not stretch in the normal layout', () => {
    const { container } = render(<DetailsPane note={null}>details</DetailsPane>);
    const pane = container.querySelector('aside');
    expect(pane?.style.width, 'the width of the pane is set by the person').not.toBe('');
    expect(pane?.className.includes('shrink-0')).toBe(true);
  });

  it('fills the column when the whole column is given to it', () => {
    const { container } = render(
      <DetailsPane note={null} fill>
        details
      </DetailsPane>,
    );
    const pane = container.querySelector('aside');
    expect(
      pane?.className.includes('flex-1'),
      'in full-screen mode the pane takes the column, otherwise a gap gapes next to it',
    ).toBe(true);
    expect(pane?.style.width, 'a fixed width only gets in the way here').toBe('');
  });
});
