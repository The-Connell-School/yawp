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

const posthogCapture = mock(() => {});

const locationPathname = { value: '/auth/login' };

mock.module('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

mock.module('react-router', () => ({
  useLocation: () => ({
    pathname: locationPathname.value,
    search: '',
    hash: '',
    state: null,
    key: 'default',
  }),
}));

mock.module('sonner', () => ({
  Toaster: () => null,
  toast: {
    error: () => {},
    success: () => {},
    message: () => {},
  },
}));

const { Toaster } = await import('./toaster');

describe('Toaster error instrumentation', () => {
  it('does not emit app_error_presented for suppressed auth invitation toasts', async () => {
    posthogCapture.mockClear();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Toaster
          toast={{
            id: 'toast-1',
            type: 'error',
            title: 'Invalid invitation',
            description: 'Please contact your administrator.',
          }}
        />
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(posthogCapture).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it('emits app_error_presented for unexpected product toast errors', async () => {
    posthogCapture.mockClear();
    locationPathname.value = '/app/assignments/abc';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Toaster
          toast={{
            id: 'toast-2',
            type: 'error',
            title: 'Save failed',
            description: 'Could not save assignment',
          }}
        />
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(posthogCapture).toHaveBeenCalledTimes(1);
    const call = posthogCapture.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(call?.[0]).toBe('app_error_presented');
    locationPathname.value = '/auth/login';
    act(() => root.unmount());
    container.remove();
  });
});

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
