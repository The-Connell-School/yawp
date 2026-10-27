import { describe, expect, mock, test } from 'bun:test';

mock.module('react-router', () => ({
  useRouteLoaderData: () => ({ user: null }),
  useLocation: () => ({ pathname: '/free', search: '' }),
  useRevalidator: () => ({ revalidate: () => {}, state: 'idle' }),
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
import { DevPanelClassSimulationFlyout } from './dev-panel-class-simulation-flyout';

function ActiveFlyout() {
  const api = useDevPanel();
  if (api.state.subSheet === 'class-simulation') {
    return createElement(DevPanelClassSimulationFlyout, {
      onClose: () => api.closeSubSheet(),
    });
  }
  return null;
}

describe('dev panel class simulation flyout', () => {
  test('renders docked flyout only for class simulation subSheet', () => {
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
      api!.openSubSheet('class-simulation');
    });
    expect(container.querySelector('[data-yawp-dev-panel-flyout]')).not.toBeNull();
    root.unmount();
    container.remove();
  });
});
