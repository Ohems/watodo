import { useCallback, useState } from 'react';

/**
 * useState persisted to localStorage under `key` (JSON encoded). The stored
 * value is read once on mount; `validate` guards against corrupted or
 * outdated shapes by falling back to `defaultValue`. Storage access is
 * wrapped in try/catch so browsers with storage disabled (e.g. private
 * mode) fall back to plain in-memory state.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  validate: (value: unknown) => value is T,
): [T, (updater: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      const parsed: unknown = JSON.parse(raw);
      return validate(parsed) ? parsed : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedState = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setState(prev => {
        const next = typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage unavailable (e.g. private mode); keep the in-memory value.
        }
        return next;
      });
    },
    [key],
  );

  return [state, setPersistedState];
}
