import { startTransition } from 'react';

/** Wait for the SSR shell to finish hydrating before scheduling a state update. */
export function scheduleAfterHydration(callback: () => void) {
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      startTransition(callback);
    });
  });
}