import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { useCardPageUnsavedFormGuard } from './use-card-page-unsaved-form-guard';

function GuardProbe({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { dirty } = useCardPageUnsavedFormGuard(ref, enabled);
  return (
    <div ref={ref} data-dirty={dirty ? 'yes' : 'no'}>
      <form>
        <input name="email" defaultValue="" aria-label="email" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

describe('useCardPageUnsavedFormGuard', () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  test('blocks beforeunload only while the form is dirty', () => {
    let beforeUnloadListener: ((event: BeforeUnloadEvent) => void) | undefined;
    const originalAdd = window.addEventListener;
    window.addEventListener = ((type: string, listener: EventListener) => {
      if (type === 'beforeunload') {
        beforeUnloadListener = listener as (event: BeforeUnloadEvent) => void;
      }
      return originalAdd.call(window, type, listener);
    }) as typeof window.addEventListener;

    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root!.render(
          <MemoryRouter>
            <GuardProbe enabled />
          </MemoryRouter>
        );
      });

      expect(beforeUnloadListener).toBeDefined();

      const cleanEvent = {
        preventDefault: mock(() => {}),
      } as unknown as BeforeUnloadEvent;
      beforeUnloadListener?.(cleanEvent);
      expect(cleanEvent.preventDefault).not.toHaveBeenCalled();

      const input = document.querySelector('input[name="email"]') as HTMLInputElement;
      act(() => {
        input.value = 'typed';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(document.querySelector('[data-dirty]')?.getAttribute('data-dirty')).toBe(
        'yes'
      );

      const dirtyEvent = {
        preventDefault: mock(() => {}),
      } as unknown as BeforeUnloadEvent;
      beforeUnloadListener?.(dirtyEvent);
      expect(dirtyEvent.preventDefault).toHaveBeenCalled();

      act(() => {
        document.querySelector('form')?.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true })
        );
      });

      const afterSubmitEvent = {
        preventDefault: mock(() => {}),
      } as unknown as BeforeUnloadEvent;
      beforeUnloadListener?.(afterSubmitEvent);
      expect(afterSubmitEvent.preventDefault).not.toHaveBeenCalled();
    } finally {
      window.addEventListener = originalAdd;
    }
  });
});
