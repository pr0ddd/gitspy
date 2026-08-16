import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Hint, TooltipProvider } from '@/components/ui/tooltip';

describe('toggle state', () => {
  it('inside a tooltip the pressed state rides on aria-pressed: the tooltip trigger overwrites data-state', () => {
    const { container } = render(
      <TooltipProvider>
        <Hint text="x">
          <Toggle pressed aria-label="t">
            x
          </Toggle>
        </Hint>
      </TooltipProvider>,
    );
    const button = container.querySelector('button')!;
    expect(button.getAttribute('data-state'), 'the tooltip takes data-state for itself').toBe(
      'closed',
    );
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.className, 'the pressed fill is bound to aria-pressed').toContain(
      'aria-pressed:bg-control-fill',
    );
  });

  it('a group item inside a tooltip is a radio button with aria-checked', () => {
    const { container } = render(
      <TooltipProvider>
        <ToggleGroup type="single" value="b">
          <Hint text="a">
            <ToggleGroupItem value="a">a</ToggleGroupItem>
          </Hint>
          <Hint text="b">
            <ToggleGroupItem value="b">b</ToggleGroupItem>
          </Hint>
        </ToggleGroup>
      </TooltipProvider>,
    );
    const [a, b] = Array.from(container.querySelectorAll('button'));
    expect(a.getAttribute('aria-checked')).toBe('false');
    expect(b.getAttribute('aria-checked')).toBe('true');
    expect(b.className).toContain('aria-checked:bg-control-fill');
  });
});
