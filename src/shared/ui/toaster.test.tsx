import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { Toaster } from './sonner';

describe('the toaster', () => {
  it('owns the look of every toast: no library styling, a block for the kind, a title, a detail and a close button', async () => {
    render(<Toaster />);
    toast.success('Pushed', { description: 'develop → origin/develop, 2 commits' });

    const title = await screen.findByText('Pushed');
    const item = title.closest('[data-sonner-toast]') as HTMLElement | null;
    expect(item, 'the toast is a sonner list item').not.toBeNull();
    expect(item!.getAttribute('data-type'), 'the kind is on the toast for the block colour').toBe(
      'success',
    );
    expect(item!.getAttribute('data-styled'), 'the library paints nothing of its own').toBe(
      'false',
    );
    expect(
      item!.querySelector('[data-icon] svg'),
      'the block carries the kind glyph',
    ).not.toBeNull();
    expect(item!.querySelector('[data-description]')?.textContent).toBe(
      'develop → origin/develop, 2 commits',
    );
    expect(item!.querySelector('[data-close-button]'), 'every toast can be closed').not.toBeNull();
    toast.dismiss();
  });

  it('hands the library our colours for the one part it still paints itself: the close button', async () => {
    render(<Toaster style={{ '--width': '430px' } as React.CSSProperties} />);
    toast.info('Copied');
    await screen.findByText('Copied');
    const toaster = document.querySelector('[data-sonner-toaster]') as HTMLElement;

    expect(toaster.style.getPropertyValue('--normal-bg'), 'no black square behind the cross').toBe(
      'transparent',
    );
    expect(toaster.style.getPropertyValue('--normal-border')).toBe('transparent');
    expect(toaster.style.getPropertyValue('--normal-text')).toBe('var(--muted-foreground)');
    expect(toaster.style.getPropertyValue('--normal-bg-hover')).toBe('var(--hover-fill)');
    expect(
      toaster.style.getPropertyValue('--width'),
      'and keeps what the app passes in the same style prop',
    ).toBe('430px');
    toast.dismiss();
  });

  it('keeps a stack of toasts open instead of collapsing them behind the front one', async () => {
    render(<Toaster />);
    toast.info('Already up to date');
    toast.success('Pulled');

    await screen.findByText('Pulled');
    await waitFor(() => {
      const items = document.querySelectorAll('[data-sonner-toast]');
      expect(items.length).toBe(2);
      for (const item of items) {
        expect(item.getAttribute('data-expanded'), 'expanded, as the toaster asks').toBe('true');
      }
    });
    toast.dismiss();
  });
});
