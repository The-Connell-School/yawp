import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, test } from 'bun:test';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

const {
  canBrowserHistoryGoBack,
  handleHistoryBackClick,
  navigateBackOr,
} = await import('./browser-history-back.client');

function withWindowHistoryState(state: unknown, fn: () => void) {
  if (typeof window === 'undefined') {
    fn();
    return;
  }
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'history');
  const prior = window.history;
  Object.defineProperty(window, 'history', {
    configurable: true,
    value: { state },
  });
  try {
    fn();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(window, 'history', originalDescriptor);
    } else {
      Object.defineProperty(window, 'history', {
        configurable: true,
        value: prior,
      });
    }
  }
}

describe('browser history back', () => {
  test('canBrowserHistoryGoBack is false without idx', () => {
    withWindowHistoryState({}, () => {
      expect(canBrowserHistoryGoBack()).toBe(false);
    });
  });

  test('canBrowserHistoryGoBack is true when idx > 0', () => {
    withWindowHistoryState({ idx: 2 }, () => {
      expect(canBrowserHistoryGoBack()).toBe(true);
    });
  });

  test('navigateBackOr uses history when possible', () => {
    withWindowHistoryState({ idx: 1 }, () => {
      const calls: Array<number | string> = [];
      const navigate = ((delta: number | string) => {
        calls.push(delta);
      }) as never;
      navigateBackOr(navigate, '/app/assignments');
      expect(calls).toEqual([-1]);
    });
  });

  test('navigateBackOr falls back when idx is missing', () => {
    withWindowHistoryState({}, () => {
      const calls: Array<number | string> = [];
      const navigate = ((delta: number | string) => {
        calls.push(delta);
      }) as never;
      navigateBackOr(navigate, '/app/assignments');
      expect(calls).toEqual(['/app/assignments']);
    });
  });

  test('handleHistoryBackClick prevents default when history exists', () => {
    withWindowHistoryState({ idx: 3 }, () => {
      let prevented = false;
      const navigate = (() => {}) as never;
      handleHistoryBackClick(
        {
          preventDefault: () => {
            prevented = true;
          },
        },
        navigate
      );
      expect(prevented).toBe(true);
    });
  });
});
