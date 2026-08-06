import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tab } from './parts';

describe('таб верхней полосы', () => {
  it('клик по табу выбирает его, крестик закрывает и не выбирает', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <Tab
        icon="folder"
        label="react"
        current={false}
        closeLabel="Close"
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText('react'));
    expect(onSelect).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect, 'крестик не должен заодно активировать таб').toHaveBeenCalledOnce();
  });

  it('активный таб несёт заливку и всегда видимый крестик', () => {
    render(
      <Tab icon="folder" label="wip" current closeLabel="Close" onSelect={() => {}} onClose={() => {}} />,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.className).toContain('opacity-100');
  });
});
