import { useEffect, useRef } from 'react';

export function useCallDebouncedCallback<T>(
  callback: () => void,
  delay: number,
  dependencies: T[]
): void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Call on initial render
  useEffect(() => {
    callback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback();
    }, delay);

    // Cleanup function to clear the timeout if the component unmounts
    // or if the effect runs again before the timeout is complete.
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies]); // Spread dependencies array into useEffect's dependency list
}
