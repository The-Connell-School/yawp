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
import { MemoryRouter } from 'react-router';
import { TeachingAccessBanner } from './teaching-access-banner';

describe('TeachingAccessBanner', () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  it('does not truncate the approval message at narrow widths', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <MemoryRouter>
          <TeachingAccessBanner adminName="QA Admin D" />
        </MemoryRouter>
      );
    });
    const message = document.querySelector(
      '[data-testid="teaching-access-banner"] span.min-w-0'
    );
    expect(message?.className.includes('truncate')).toBe(false);
    expect(message?.textContent).toContain('QA Admin D');
    const link = document.querySelector('a[href="/app/free-tier/pending"]');
    expect(link?.textContent).toBe('View status');
  });
});
