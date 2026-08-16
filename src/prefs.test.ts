import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { readPref, usePref, writePref } from '@/prefs';

describe('preference storage', () => {
  beforeEach(() => localStorage.clear());

  it('empty storage hands back the fallback value', () => {
    expect(readPref('diff.mode', 'split')).toBe('split');
  });

  it('a written value survives a read', () => {
    writePref('diff.mode', 'hunk');
    expect(readPref('diff.mode', 'split')).toBe('hunk');
  });

  it('broken JSON does not crash the read, it falls back instead', () => {
    localStorage.setItem('gitspy.diff.mode', '{oops');
    expect(readPref('diff.mode', 'split')).toBe('split');
  });

  it('keys live under a shared prefix and are not confused with foreign ones', () => {
    localStorage.setItem('diff.mode', JSON.stringify('inline'));
    expect(
      readPref('diff.mode', 'split'),
      'an entry without the prefix belongs to somebody else',
    ).toBe('split');
  });

  it('a write from elsewhere reaches an already mounted preference', () => {
    const { result } = renderHook(() => usePref('term.dock.open', false));
    act(() => writePref('term.dock.open', true));
    expect(
      result.current[0],
      'otherwise the dock cannot be opened from anywhere else: the new value sits in storage while the screen still shows the old one',
    ).toBe(true);
  });

  it('a foreign key does not wake the preference', () => {
    const { result } = renderHook(() => usePref('term.dock.open', false));
    act(() => writePref('term.dock.side', 'right'));
    expect(result.current[0], 'a preference listens to its own key, not to the whole storage').toBe(
      false,
    );
  });
});
