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
import { writeDevPanelState } from './dev-panel-storage';

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

  test('restores an open panel from localStorage after mount', () => {
    writeDevPanelState(window.localStorage, {
      open: true,
      openSections: ['sign-in'],
      org: null,
      subSheet: null,
      scroll: {},
      forms: { throwawaySwitch: true, blackboardRole: 'teacher' },
    });
    const container = document.createElement('div');
    const root = createRoot(container);
    function OpenFlag() {
      const { state } = useDevPanel();
      return createElement('span', {
        'data-open': state.open ? 'yes' : 'no',
        'data-restored': state.restored ? 'yes' : 'no',
      });
    }
    act(() => {
      root.render(
        createElement(
          DevPanelProvider,
          {
            envBadge: 'Dev',
            previewAccessGateEnabled: false,
            previewAccessSeatLabel: null,
            children: createElement(OpenFlag),
          }
        )
      );
    });
    expect(container.querySelector('[data-open]')?.getAttribute('data-open')).toBe('yes');
    expect(container.querySelector('[data-restored]')?.getAttribute('data-restored')).toBe(
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
