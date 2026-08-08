import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { readPref, usePref, writePref } from '@/prefs';

describe('память настроек', () => {
  beforeEach(() => localStorage.clear());

  it('пустое хранилище отдаёт запасное значение', () => {
    expect(readPref('diff.mode', 'split')).toBe('split');
  });

  it('записанное значение переживает чтение', () => {
    writePref('diff.mode', 'hunk');
    expect(readPref('diff.mode', 'split')).toBe('hunk');
  });

  it('битый JSON не роняет чтение, а откатывается к запасному', () => {
    localStorage.setItem('gitspy.diff.mode', '{oops');
    expect(readPref('diff.mode', 'split')).toBe('split');
  });

  it('ключи живут под общим префиксом и не путаются с чужими', () => {
    localStorage.setItem('diff.mode', JSON.stringify('inline'));
    expect(readPref('diff.mode', 'split'), 'без префикса — чужая запись').toBe('split');
  });

  it('запись со стороны доходит до смонтированной настройки', () => {
    const { result } = renderHook(() => usePref('term.dock.open', false));
    act(() => writePref('term.dock.open', true));
    expect(
      result.current[0],
      'иначе открыть док из чужого места нельзя: значение в хранилище, а на экране старое',
    ).toBe(true);
  });

  it('чужой ключ не будит настройку', () => {
    const { result } = renderHook(() => usePref('term.dock.open', false));
    act(() => writePref('term.dock.side', 'right'));
    expect(result.current[0], 'настройка слушает свой ключ, а не всё хранилище').toBe(false);
  });
});
