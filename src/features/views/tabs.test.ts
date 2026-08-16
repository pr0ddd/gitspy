import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useViewTabs } from './tabs';

describe('the app view tabs', () => {
  it('shows a tab when a view is opened and adds no second one when it is opened again', () => {
    const hook = renderHook(() => useViewTabs());
    act(() => hook.result.current.open('settings'));
    act(() => hook.result.current.open('settings'));
    expect(hook.result.current.views, 'a view has one tab, the one settings already had').toEqual([
      'settings',
    ]);
    expect(hook.result.current.view).toBe('settings');
  });

  it('keeps tabs side by side and switches between them', () => {
    const hook = renderHook(() => useViewTabs());
    act(() => hook.result.current.open('settings'));
    act(() => hook.result.current.open('changelog'));
    expect(hook.result.current.views).toEqual(['settings', 'changelog']);
    expect(hook.result.current.view, 'the tab just opened becomes the current one').toBe(
      'changelog',
    );
  });

  it('leaves the tab open when the repository takes over the screen', () => {
    const hook = renderHook(() => useViewTabs());
    act(() => hook.result.current.open('changelog'));
    act(() => hook.result.current.leave());
    expect(hook.result.current.views, 'the tab stays in the strip exactly as it was').toEqual([
      'changelog',
    ]);
    expect(hook.result.current.view, 'but the screen is given to the repository').toBeNull();
  });

  it('returns to the repository when the current tab is closed', () => {
    const hook = renderHook(() => useViewTabs());
    act(() => hook.result.current.open('settings'));
    act(() => hook.result.current.close('settings'));
    expect(hook.result.current.views).toEqual([]);
    expect(hook.result.current.view, 'a closed tab cannot stay on the screen').toBeNull();
  });

  it('does not reset the current tab when a neighbouring one is closed', () => {
    const hook = renderHook(() => useViewTabs());
    act(() => hook.result.current.open('settings'));
    act(() => hook.result.current.open('changelog'));
    act(() => hook.result.current.close('settings'));
    expect(hook.result.current.view, 'it was not the tab that was closed').toBe('changelog');
  });
});
