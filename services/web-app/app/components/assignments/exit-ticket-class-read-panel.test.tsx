import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';

const { ExitTicketClassReadPanel } =
  await import('./exit-ticket-class-read-panel');
const { buildExitTicketClassRead } =
  await import('~/domain/assignment-types/exit-ticket-class-read');

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
});

function render(props: Parameters<typeof ExitTicketClassReadPanel>[0]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MemoryRouter>
        <ExitTicketClassReadPanel {...props} />
      </MemoryRouter>
    );
  });
  return container;
}

const read = buildExitTicketClassRead({
  responses: [
    {
      studentName: 'Ada',
      text: 'I get it now.',
      rubricScores: { understanding: { score: 90 } },
    },
    {
      studentName: 'Dee',
      text: 'Why does erosion need water?',
      rubricScores: { understanding: { score: 20 } },
    },
  ],
  config: null,
});

describe('ExitTicketClassReadPanel', () => {
  it('shows the bands, the open questions and who to follow up with', () => {
    const container = render({
      read,
      planHref: '/app/lesson-planner?from=ca-1&step=exit-ticket',
    });
    const text = container.textContent ?? '';

    expect(text).toContain('Class read');
    expect(text).toContain('2 of 2 responses read');
    expect(text).toContain('Explains it');
    expect(text).toContain('Why does erosion need water?');
    expect(text).toContain('Dee');

    const plan = container.querySelector<HTMLAnchorElement>(
      '[data-testid="exit-ticket-plan-tomorrow"]'
    );
    expect(plan?.getAttribute('href')).toBe(
      '/app/lesson-planner?from=ca-1&step=exit-ticket'
    );
  });

  it('offers no planner link where the planner is not available', () => {
    const container = render({ read, planHref: null });
    expect(
      container.querySelector('[data-testid="exit-ticket-plan-tomorrow"]')
    ).toBeNull();
  });

  it('says plainly when nothing has come back yet', () => {
    const container = render({
      read: buildExitTicketClassRead({ responses: [], config: null }),
      planHref: '/x',
    });
    expect(container.textContent).toContain('No responses yet');
    expect(
      container.querySelector('[data-testid="exit-ticket-plan-tomorrow"]')
    ).toBeNull();
  });
});
