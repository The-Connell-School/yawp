import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { writeDevPanelState } from './dev-panel-storage';

const revalidate = mock();
const actualReactRouter = await import('react-router');
mock.module('react-router', () => ({
  ...actualReactRouter,
  useRevalidator: () => ({ revalidate }),
}));

const { DevPanelProvider } = await import('./dev-panel-provider');
const { DevPanelClassSimulationInline } = await import(
  './dev-panel-class-simulation-inline'
);

let root: Root | null = null;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  revalidate.mockReset();
});

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

describe('DevPanelClassSimulationInline', () => {
  test('empty state enables Populate (creates sandbox then populates)', async () => {
    globalThis.fetch = mock(async (input, init) => {
      if (
        typeof input === 'string' &&
        input.endsWith('/api/dev-panel/teacher-classes') &&
        init?.method === 'POST'
      ) {
        return Response.json({
          ok: true,
          class: {
            id: 'sandbox-1',
            title: 'Simulation sandbox',
            code: 'DEV1',
            schoolYear: '2025-2026',
            simulatedStudentCount: 0,
          },
        });
      }
      if (
        typeof input === 'string' &&
        input.endsWith('/api/dev-panel/teacher-classes')
      ) {
        return Response.json({ classes: [] });
      }
      if (
        typeof input === 'string' &&
        input.endsWith('/api/dev-panel/class-simulation') &&
        init?.method === 'POST'
      ) {
        return Response.json({
          ok: true,
          counts: { students: 3, assignments: 1 },
          message: 'Added 3 students across 1 assignment.',
        });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    writeDevPanelState(window.localStorage, {
      open: true,
      openSections: ['tester-tools', 'class-simulation'],
      org: null,
      subSheet: null,
      scroll: {},
      forms: { simulationStudentCount: 3 },
    });

    const container = renderTree(
      <MemoryRouter>
        <DevPanelProvider
          envBadge="Dev"
          previewAccessGateEnabled={false}
          previewAccessSeatLabel={null}
        >
          <DevPanelClassSimulationInline sectionOpen={true} />
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
    expect(populate?.disabled).toBe(false);

    await act(async () => {
      populate?.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(revalidate).toHaveBeenCalled();
  });
});
