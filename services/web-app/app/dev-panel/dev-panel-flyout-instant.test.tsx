import { describe, expect, mock, test } from 'bun:test';

mock.module('react-router', () => ({
  useRouteLoaderData: () => ({ user: null }),
  useLocation: () => ({ pathname: '/free', search: '' }),
}));
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // shared process
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { DevPanelProvider, useDevPanel } from './dev-panel-provider';
import { DevPanelGiveFeedbackFlyout } from './dev-panel-give-feedback-flyout';
import { DevPanelFreeTierFlyout } from './dev-panel-free-tier-flyout';

function ActiveFlyout() {
  const api = useDevPanel();
  if (api.state.subSheet === 'give-feedback') {
    return createElement(DevPanelGiveFeedbackFlyout, {
      onClose: () => api.closeSubSheet(),
      feedbackActions: () => [],
    });
  }
  if (api.state.subSheet === 'free-tier-states') {
    return createElement(DevPanelFreeTierFlyout, {
      onClose: () => api.closeSubSheet(),
      orgId: 'org-1',
    });
  }
  return null;
}

describe('dev panel flyout instant switch', () => {
  test('applies data-instant on the flyout element when swapping sheets', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let api: ReturnType<typeof useDevPanel> | null = null;
    function Harness() {
      api = useDevPanel();
      return createElement(ActiveFlyout);
    }
    act(() => {
      root.render(
        createElement(
          DevPanelProvider,
          {
            envBadge: 'Dev',
            previewAccessGateEnabled: false,
            previewAccessSeatLabel: null,
            children: createElement(Harness),
          }
        )
      );
    });
    act(() => {
      api!.openSubSheet('give-feedback');
    });
    act(() => {
      api!.openSubSheet('free-tier-states');
    });
    act(() => {
      api!.openSubSheet('give-feedback');
    });
    const flyout = container.querySelector('[data-yawp-dev-panel-flyout][data-instant="true"]');
    expect(flyout).not.toBeNull();
    root.unmount();
    container.remove();
  });
});
