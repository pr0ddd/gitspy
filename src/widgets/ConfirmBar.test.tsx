import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../i18n';
import { ConfirmBar } from './ConfirmBar';
import type { Effect } from '@/entities/repo';

describe('the confirm bar', () => {
  it('shows nothing when there is nothing to confirm', () => {
    const { container } = render(
      <ConfirmBar confirmation={null} onChoice={() => {}} onCancel={() => {}} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('spells out the operation with its subject and hands the effect back on the red button', () => {
    const chosen: Effect[] = [];
    render(
      <ConfirmBar
        confirmation={{ kind: 'operation', operation: { kind: 'branchDelete', name: 'feature' } }}
        onChoice={(effect) => chosen.push(effect)}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText(/delete branch feature\?/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^delete branch$/i }));

    expect(chosen).toEqual([{ kind: 'run', operation: { kind: 'branchDelete', name: 'feature' } }]);
  });

  it('a rejected push shows both ways out and Cancel, and Escape cancels', () => {
    const onCancel = vi.fn();
    const chosen: Effect[] = [];
    render(
      <ConfirmBar
        confirmation={{ kind: 'pushRejected', branch: 'main', upstream: 'origin/main' }}
        onChoice={(effect) => chosen.push(effect)}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText(/main is behind origin\/main/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^pull$/i }));
    fireEvent.click(screen.getByRole('button', { name: /force push/i }));
    expect(chosen.map((c) => c.kind === 'run' && c.operation.kind)).toEqual([
      'pull',
      'pushForceWithLease',
    ]);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel, 'Escape is the same as Cancel').toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
