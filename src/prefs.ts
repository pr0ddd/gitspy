import { useCallback, useState } from 'react';

const KEY_PREFIX = 'gitspy.';

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
};

export function usePref<T>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, fallback));
  const set = useCallback(
    (next: T) => {
      setValue(next);
      writePref(key, next);
    },
    [key],
  );
  return [value, set];
}
