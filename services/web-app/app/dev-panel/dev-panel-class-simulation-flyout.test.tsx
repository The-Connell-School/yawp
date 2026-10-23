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
import { DevPanelClassSimulationFlyout } from './dev-panel-class-simulation-flyout';
import { writeDevPanelState } from './dev-panel-storage';

let root: Root | null = null;
const originalFetch = globalThis.fetch;

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
  globalThis.fetch = originalFetch;
});

describe('DevPanelClassSimulationFlyout', () => {
  test('shows empty copy when teacher has no classes', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ classes: [] })
    ) as unknown as typeof fetch;
    writeDevPanelState(window.localStorage, {
      open: true,
      openSections: ['data'],
      org: null,
      subSheet: 'class-simulation',
      scroll: {},
      forms: { simulationStudentCount: 20 },
    });
    const container = renderTree(
      <MemoryRouter>
        <DevPanelProvider
          envBadge="Dev"
          previewAccessGateEnabled={false}
          previewAccessSeatLabel={null}
        >
          <DevPanelClassSimulationFlyout onClose={() => {}} />
        </DevPanelProvider>
      </MemoryRouter>
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(container.textContent).toContain("You don't own any classes yet");
    const populate = [...container.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Populate class')
    );
    expect(populate?.disabled).toBe(true);
  });
});
