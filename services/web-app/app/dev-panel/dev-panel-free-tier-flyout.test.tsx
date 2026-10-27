import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, mock, test } from 'bun:test';

mock.module('react-router', () => ({
  useRouteLoaderData: () => ({ user: { email: 'dev.teacher@yawp.local', name: 'Jordan Rivera' } }),
  useLocation: () => ({ pathname: '/free', search: '' }),
}));
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { DevPanelProvider } from './dev-panel-provider';
import { DevPanelFreeTierFlyout } from './dev-panel-free-tier-flyout';
import { writeDevPanelState } from './dev-panel-storage';

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

describe('DevPanelFreeTierFlyout', () => {
  test('disables jump until a state is selected', () => {
    writeDevPanelState(window.localStorage, {
      open: true,
      openSections: ['sign-in'],
      org: 'org-1',
      subSheet: 'free-tier-states',
      scroll: {},
      forms: { throwawaySwitch: true, blackboardRole: 'teacher', selectedStateId: null },
    });
    const container = renderTree(
      <MemoryRouter>
        <DevPanelProvider
          envBadge="Dev"
          previewAccessGateEnabled={false}
          previewAccessSeatLabel={null}
        >
          <DevPanelFreeTierFlyout onClose={() => {}} orgId="org-1" />
        </DevPanelProvider>
      </MemoryRouter>
    );
    const buttons = [...container.querySelectorAll('button')];
    const jumpButton = buttons.find((btn) => btn.textContent === 'Jump to this state');
    expect(jumpButton?.disabled).toBe(true);
  });
});
