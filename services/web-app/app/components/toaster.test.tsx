import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, expect, it, mock } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const breakpoint = { value: 'base' as string };

mock.module('~/hooks/useBreakpoint', () => ({
  default: () => breakpoint.value,
}));

const { Toaster } = await import('./toaster');

describe('Toaster mobile placement', () => {
  it('uses top-center on phone breakpoints', () => {
    breakpoint.value = 'base';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Toaster />);
    });
    const region = container.querySelector('[data-yawp-mobile-toast]');
    expect(region?.getAttribute('data-yawp-mobile-toast')).toBe('true');
    act(() => root.unmount());
    container.remove();
  });

  it('keeps desktop placement off phone breakpoints', () => {
    breakpoint.value = 'lg';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Toaster />);
    });
    const region = container.querySelector('[data-yawp-mobile-toast]');
    expect(region).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
