import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // shared process
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, mock, test } from 'bun:test';

async function flushAfterHydration() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 0);
        });
      });
    });
  });
}
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { DevPanelProvider } from './dev-panel-provider';
import { DevPanelFreeTierInline } from './dev-panel-free-tier-inline';
import { writeDevPanelState } from './dev-panel-storage';

mock.module('react-router', () => ({
  useRouteLoaderData: () => ({ user: { email: 'dev.teacher@yawp.local' } }),
  useLocation: () => ({ pathname: '/free', search: '' }),
}));

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

describe('DevPanelFreeTierInline', () => {
  test('uses jump rows with inline confirm, not radios or flyouts', async () => {
    writeDevPanelState(window.localStorage, {
      open: true,
      openSections: ['free-tier-states'],
      org: 'org-1',
      subSheet: null,
      scroll: {},
      forms: {
        throwawaySwitch: true,
        blackboardRole: 'teacher',
        selectedStateId: 'pending.waiting-on-admin',
      },
    });
    const container = renderTree(
      <MemoryRouter>
        <DevPanelProvider
          envBadge="Dev"
          previewAccessGateEnabled={false}
          previewAccessSeatLabel={null}
        >
          <DevPanelFreeTierInline orgId="org-1" sectionOpen />
        </DevPanelProvider>
      </MemoryRouter>
    );
    await flushAfterHydration();
    expect(container.querySelectorAll('input[type="radio"]').length).toBe(0);
    expect(container.querySelector('[data-yawp-dev-panel-flyout]')).toBeNull();
    expect(container.textContent).toContain('Now: Pending approval (SENT)');

    const approvedRow = [...container.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Approved')
    );
    expect(approvedRow).toBeTruthy();
    act(() => {
      approvedRow!.click();
    });
    expect(container.textContent).toContain(
      'Jump to this state? Your test account changes and the page reloads.'
    );
    expect(container.textContent).toContain('Jump');
    expect(container.textContent).toContain('Cancel');

    const cancel = [...container.querySelectorAll('button')].find((btn) =>
      btn.textContent === 'Cancel'
    );
    act(() => {
      cancel!.click();
    });
    expect(container.textContent).not.toContain('Jump to this state?');
  });
});
