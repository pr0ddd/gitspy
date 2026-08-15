import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useViewTabs } from './tabs';

describe('вкладки приложения', () => {
  it('открытие показывает вкладку, повторное открытие не заводит вторую', () => {
    const hook = renderHook(() => useViewTabs());
    act(() => hook.result.current.open('settings'));
    act(() => hook.result.current.open('settings'));
    expect(hook.result.current.views, 'вкладка одна на вид, как у настроек до этого').toEqual([
      'settings',
    ]);
    expect(hook.result.current.view).toBe('settings');
  });

  it('вкладки живут рядом и переключаются', () => {
    const hook = renderHook(() => useViewTabs());
    act(() => hook.result.current.open('settings'));
    act(() => hook.result.current.open('changelog'));
    expect(hook.result.current.views).toEqual(['settings', 'changelog']);
    expect(hook.result.current.view, 'открытая вкладка становится текущей').toBe('changelog');
  });

  it('уход на репозиторий оставляет вкладку открытой', () => {
    const hook = renderHook(() => useViewTabs());
    act(() => hook.result.current.open('changelog'));
    act(() => hook.result.current.leave());
    expect(hook.result.current.views, 'вкладка остаётся в полосе, как и была').toEqual([
      'changelog',
    ]);
    expect(hook.result.current.view, 'но экран отдан репозиторию').toBeNull();
  });

  it('закрытие текущей вкладки возвращает к репозиторию', () => {
    const hook = renderHook(() => useViewTabs());
    act(() => hook.result.current.open('settings'));
    act(() => hook.result.current.close('settings'));
    expect(hook.result.current.views).toEqual([]);
    expect(hook.result.current.view, 'закрытая вкладка не может остаться на экране').toBeNull();
  });

  it('закрытие соседней вкладки не сбрасывает текущую', () => {
    const hook = renderHook(() => useViewTabs());
    act(() => hook.result.current.open('settings'));
    act(() => hook.result.current.open('changelog'));
    act(() => hook.result.current.close('settings'));
    expect(hook.result.current.view, 'закрывали не её').toBe('changelog');
  });
});
