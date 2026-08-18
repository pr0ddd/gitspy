import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('a steady button', () => {
  it('is inert while disabled but keeps its full opacity, and the flag never reaches the DOM', () => {
    render(
      <Button steady disabled>
        Pull
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Pull' });

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.className, 'the base fade is overridden').toContain('disabled:opacity-100');
    expect(button.hasAttribute('steady'), 'a cva flag is not an HTML attribute').toBe(false);
  });

  it('an ordinary disabled button still fades', () => {
    render(<Button disabled>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });

    expect(button.className).toContain('disabled:opacity-50');
    expect(button.className).not.toContain('disabled:opacity-100');
  });
});
