import { useCallback, useEffect, useState } from 'react';

const KEY_PREFIX = 'gitspy.';

const watchers = new Map<string, Set<(value: unknown) => void>>();

const watchPref = (key: string, changed: (value: unknown) => void): (() => void) => {
  const watching = watchers.get(key) ?? new Set<(value: unknown) => void>();
  watching.add(changed);
  watchers.set(key, watching);
  return () => {
    watching.delete(changed);
    if (watching.size === 0) watchers.delete(key);
  };
};

export const readPref = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writePref = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
  } catch {
    return;
  }
  watchers.get(key)?.forEach((changed) => changed(value));
};

export function usePref<T>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, fallback));
  useEffect(() => watchPref(key, (written) => setValue(written as T)), [key]);
  const set = useCallback(
    (next: T) => {
      setValue(next);
      writePref(key, next);
    },
    [key],
  );
  return [value, set];
}
