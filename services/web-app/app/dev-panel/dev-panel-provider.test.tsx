import { describe, expect, test } from 'bun:test';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { DevPanelProvider, useDevPanel } from './dev-panel-provider';

function Probe() {
  const { unlocked, flyoutSwitchInstant, openSubSheet, state } = useDevPanel();
  return createElement(
    'div',
    {
      'data-unlocked': unlocked ? 'yes' : 'no',
      'data-instant': flyoutSwitchInstant ? 'yes' : 'no',
      'data-sheet': state.subSheet ?? '',
    },
    null
  );
}

describe('DevPanelProvider', () => {
  test('unlocks when preview gate is off', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(
          DevPanelProvider,
          {
            envBadge: 'Dev',
            previewAccessGateEnabled: false,
            previewAccessSeatLabel: null,
            children: createElement(Probe),
          }
        )
      );
    });
    expect(container.querySelector('[data-unlocked]')?.getAttribute('data-unlocked')).toBe(
      'yes'
    );
    root.unmount();
  });

  test('marks flyout switches as instant when swapping sheets', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    let api: ReturnType<typeof useDevPanel> | null = null;
    function Capture() {
      api = useDevPanel();
      return createElement(Probe);
    }
    act(() => {
      root.render(
        createElement(
          DevPanelProvider,
          {
            envBadge: 'Dev',
            previewAccessGateEnabled: false,
            previewAccessSeatLabel: null,
            children: createElement(Capture),
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
    expect(container.querySelector('[data-instant]')?.getAttribute('data-instant')).toBe(
      'yes'
    );
    root.unmount();
  });
});
