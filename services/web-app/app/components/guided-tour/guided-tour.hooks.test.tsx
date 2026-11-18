import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';

const { GuidedTour } = await import('./guided-tour');

let root: Root | null = null;
const originalFetch = globalThis.fetch;

function renderTree(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  globalThis.fetch = originalFetch;
});

describe('PageTourController', () => {
  test('does not throw when the page tour resolves after the first render', async () => {
    const variant = document.createElement('div');
    variant.setAttribute('data-tour-variant', 'thesis_statement');
    document.body.appendChild(variant);

    globalThis.fetch = (async () =>
      new Response(null, { status: 200 })) as unknown as typeof fetch;

    expect(() => {
      renderTree(
        <MemoryRouter initialEntries={['/app/assignment-types/at_123']}>
          <GuidedTour finishedTourIds={[]} storageScope="hooks-test-scope" />
        </MemoryRouter>
      );
    }).not.toThrow();

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    });

    expect(
      document.querySelector('[data-testid="guided-tour-welcome"]')
    ).not.toBeNull();
  });
});