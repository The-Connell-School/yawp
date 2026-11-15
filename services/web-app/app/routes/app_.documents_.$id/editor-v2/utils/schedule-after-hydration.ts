import { startTransition, useSyncExternalStore } from 'react';

/** Wait for the SSR shell to finish hydrating before scheduling a state update. */
export function scheduleAfterHydration(callback: () => void) {
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      startTransition(callback);
    });
  });
}

let hydrationComplete = false;
const hydrationListeners = new Set<() => void>();

function subscribeHydrationComplete(onStoreChange: () => void) {
  hydrationListeners.add(onStoreChange);
  if (typeof window !== 'undefined' && !hydrationComplete) {
    scheduleAfterHydration(() => {
      if (hydrationComplete) return;
      hydrationComplete = true;
      for (const listener of hydrationListeners) listener();
    });
  }
  return () => {
    hydrationListeners.delete(onStoreChange);
  };
}

function getHydrationCompleteSnapshot() {
  return hydrationComplete;
}

function getHydrationCompleteServerSnapshot() {
  return false;
}

/**
 * False while the SSR tree is hydrating; true on subsequent client renders.
 * Uses useSyncExternalStore so we do not flip a useState boundary mid-hydrate.
 */
export function useAfterHydration() {
  return useSyncExternalStore(
    subscribeHydrationComplete,
    getHydrationCompleteSnapshot,
    getHydrationCompleteServerSnapshot
  );
}