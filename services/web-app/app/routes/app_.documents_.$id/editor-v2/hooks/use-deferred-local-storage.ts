import { useCallback, useEffect, useState } from 'react';
import { scheduleAfterHydration } from '../utils/schedule-after-hydration';

function readStoredValue<T>(key: string, initialValue: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return initialValue;
    return JSON.parse(raw) as T;
  } catch {
    return initialValue;
  }
}

/**
 * Like usehooks-ts `useLocalStorage` with `initializeWithValue: false`, but
 * restores from storage only after hydration so Suspense trees are not updated
 * mid-hydrate (usehooks-ts always syncs in a mount effect).
 */
export function useDeferredLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    scheduleAfterHydration(() => {
      setValue(readStoredValue(key, initialValue));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setStoredValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = next instanceof Function ? next(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
          window.dispatchEvent(new StorageEvent('local-storage', { key }));
        } catch (error) {
          console.warn(`Error setting localStorage key “${key}”:`, error);
        }
        return resolved;
      });
    },
    [key]
  );

  useEffect(() => {
    const handleStorageChange = (event: Event) => {
      const storageEvent = event as StorageEvent;
      if (storageEvent.key && storageEvent.key !== key) return;
      scheduleAfterHydration(() => {
        setValue(readStoredValue(key, initialValue));
      });
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('local-storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('local-storage', handleStorageChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setStoredValue];
}