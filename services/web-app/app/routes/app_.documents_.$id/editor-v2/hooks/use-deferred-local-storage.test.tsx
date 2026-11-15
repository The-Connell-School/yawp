import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDeferredLocalStorage } from './use-deferred-local-storage';

function DeferredStorageProbe({ storageKey }: { storageKey: string }) {
  const [value] = useDeferredLocalStorage(storageKey, true);
  return <span data-testid="value">{String(value)}</span>;
}

async function flushAfterHydration() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useDeferredLocalStorage', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('keeps the SSR default on the first render and restores after hydration', async () => {
    window.localStorage.setItem('test-key', JSON.stringify(false));
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(<DeferredStorageProbe storageKey="test-key" />);
    });

    expect(container.textContent).toBe('true');

    await flushAfterHydration();

    expect(container.textContent).toBe('false');
  });
});