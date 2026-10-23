import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, test } from 'bun:test';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DevPanelProvider } from './dev-panel-provider';
import { DevPanelShellBoundary } from './dev-panel-shell-boundary';

let root: Root | null = null;

function ThrowWhenOpen(): ReactNode {
  throw new Error('panel render failed');
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('DevPanelShellBoundary', () => {
  test('shows locked fallback when the shell throws', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        createElement(
          DevPanelProvider,
          {
            envBadge: 'Dev',
            previewAccessGateEnabled: true,
            previewAccessSeatLabel: 'QA',
            children: createElement(DevPanelShellBoundary, {
              open: true,
              children: createElement(ThrowWhenOpen),
            }),
          }
        )
      );
    });
    expect(document.getElementById('devtools')).toBeTruthy();
    expect(document.body.textContent).toContain("Developer tools couldn't load");
    expect(document.querySelector('[data-yawp-dev-panel-ready="true"]')).toBeTruthy();
  });
});
