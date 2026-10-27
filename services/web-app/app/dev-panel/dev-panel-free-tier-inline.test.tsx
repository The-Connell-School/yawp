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
  test('session runner is primary; advanced jumps stay inline with confirm', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/api/dev-panel/free-tier-session')) {
        return new Response(
          JSON.stringify({
            ok: true,
            snapshot: {
              stage: 'pending',
              followEmail: 'ft-test+abcd@yawp.test',
              formFilled: true,
              prefill: null,
              links: [],
              emails: [],
              teacherUserId: null,
              openAppPath: null,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    writeDevPanelState(window.localStorage, {
      open: true,
      openSections: ['free-tier-states'],
      org: 'org-1',
      subSheet: null,
      scroll: {},
      forms: {
        throwawaySwitch: true,
        selectedStateId: 'pending.waiting-on-admin',
        freeTierFollowEmail: 'ft-test+abcd@yawp.test',
        freeTierFormFilled: true,
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
    expect(container.querySelector('[data-testid="free-tier-session-runner"]')).toBeTruthy();
    expect(container.textContent).toContain('New test account');
    expect(container.textContent).toContain('Links, as emailed');
    expect(container.querySelectorAll('input[type="radio"]').length).toBe(0);
    expect(container.querySelector('[data-yawp-dev-panel-flyout]')).toBeNull();

    const advanced = [...container.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Jump to state (advanced)')
    );
    expect(advanced).toBeTruthy();
    act(() => {
      advanced!.click();
    });
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

    globalThis.fetch = originalFetch;
  });
});
