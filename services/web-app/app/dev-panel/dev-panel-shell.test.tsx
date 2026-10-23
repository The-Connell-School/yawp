import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { DevPanelProvider } from './dev-panel-provider';
import { DevPanelShell } from './dev-panel-shell';
import { writeDevPanelState } from './dev-panel-storage';

mock.module('react-router', () => {
  const actual = require('react-router');
  return {
    ...actual,
    useRouteLoaderData: () => ({ user: null }),
    useFetcher: () => ({ Form: 'form' }),
    useLocation: () => ({ pathname: '/free', search: '' }),
  };
});

let root: Root | null = null;

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
});

describe('DevPanelShell v2', () => {
  test('hides Give feedback when locked and shows it when unlocked', () => {
    writeDevPanelState(window.localStorage, {
      open: true,
      openSections: ['sign-in'],
      org: null,
      subSheet: null,
      scroll: {},
      forms: { throwawaySwitch: true, blackboardRole: 'teacher' },
    });
    const locked = renderTree(
      <MemoryRouter>
        <DevPanelProvider
          envBadge="Dev"
          previewAccessGateEnabled
          previewAccessSeatLabel={null}
        >
          <DevPanelShell />
        </DevPanelProvider>
      </MemoryRouter>
    );
    expect(locked.textContent).not.toContain('Give feedback');

    const unlocked = renderTree(
      <MemoryRouter>
        <DevPanelProvider
          envBadge="Dev"
          previewAccessGateEnabled={false}
          previewAccessSeatLabel={null}
        >
          <DevPanelShell />
        </DevPanelProvider>
      </MemoryRouter>
    );
    expect(unlocked.textContent).toContain('Give feedback');
  });

  test('only one flyout is active at a time', () => {
    writeDevPanelState(window.localStorage, {
      open: true,
      openSections: ['sign-in'],
      org: null,
      subSheet: 'give-feedback',
      scroll: {},
      forms: { throwawaySwitch: true, blackboardRole: 'teacher' },
    });
    const container = renderTree(
      <MemoryRouter>
        <DevPanelProvider
          envBadge="Dev"
          previewAccessGateEnabled={false}
          previewAccessSeatLabel={null}
        >
          <DevPanelShell />
        </DevPanelProvider>
      </MemoryRouter>
    );
    expect(container.querySelector('[aria-label="Give feedback"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Free-tier states"]')).toBeNull();
  });
});
