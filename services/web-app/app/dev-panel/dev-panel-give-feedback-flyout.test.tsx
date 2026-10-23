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
import { DevPanelGiveFeedbackFlyout } from './dev-panel-give-feedback-flyout';
import { writeDevPanelState } from './dev-panel-storage';

mock.module('react-router', () => {
  const actual = require('react-router');
  return {
    ...actual,
    useRouteLoaderData: () => ({ user: null }),
    useLocation: () => ({ pathname: '/free', search: '' }),
  };
});

mock.module('./capture-feedback-screenshot', () => ({
  captureFeedbackScreenshot: async () => null,
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

describe('DevPanelGiveFeedbackFlyout', () => {
  test('shows signed-out attribution line on public pages', () => {
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
          <DevPanelGiveFeedbackFlyout
            onClose={() => {}}
            feedbackActions={() => []}
          />
        </DevPanelProvider>
      </MemoryRouter>
    );
    expect(container.textContent).toContain('Sent as a tester (not signed in)');
    const pageUrl = container.querySelector('input[readonly]') as HTMLInputElement;
    expect(pageUrl?.value).toBe('/free');
  });
});
