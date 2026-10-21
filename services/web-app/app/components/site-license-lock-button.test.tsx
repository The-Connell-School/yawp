import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SITE_LICENSE_UNAVAILABLE_REASON } from '~/domain/free-tier/site-license-message';

function renderLockButton(breakpoint: string) {
  mock.module('~/hooks/useBreakpoint', () => ({
    default: () => breakpoint,
  }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('SiteLicenseLockButton desktop', () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    mock.restore();
  });

  it('shows tooltip on focus after ~300ms and hides on blur', async () => {
    const { SiteLicenseLockButton } = await import('./site-license-lock-button');
    ({ root } = renderLockButton('lg'));
    act(() => {
      root!.render(<SiteLicenseLockButton />);
    });
    const lock = document.querySelector(
      '[data-testid="site-license-lock-button"]'
    ) as HTMLButtonElement;
    expect(lock.getAttribute('aria-label')).toBe('Available with a site license');
    act(() => lock.focus());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(
      Array.from(document.querySelectorAll('[role="tooltip"]')).some((node) =>
        node.textContent?.includes(SITE_LICENSE_UNAVAILABLE_REASON)
      )
    ).toBe(true);
    act(() => lock.blur());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(document.querySelectorAll('[role="tooltip"]').length).toBe(0);
  });
});

describe('SiteLicenseLockButton mobile', () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    mock.restore();
  });

  it('shows tooltip on tap for ~2s', async () => {
    const { SiteLicenseLockButton } = await import('./site-license-lock-button');
    ({ root } = renderLockButton('base'));
    act(() => {
      root!.render(<SiteLicenseLockButton />);
    });
    const lock = document.querySelector(
      '[data-testid="site-license-lock-button"]'
    ) as HTMLButtonElement;
    act(() => {
      lock.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain(
      SITE_LICENSE_UNAVAILABLE_REASON
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
