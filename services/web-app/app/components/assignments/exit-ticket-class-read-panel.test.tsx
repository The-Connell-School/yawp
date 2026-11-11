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
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router';

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

describe('ExitTicketClassReadPanel with the class summary', () => {
  const stored = {
    summary: {
      understood: 'Most of the class knows Allie is Holden’s brother.',
      confusions: [
        { point: 'Some mix Allie up with D.B.', share: 'some' as const },
      ],
      reteach: 'quick-review' as const,
      reteachReason: 'The brothers are getting mixed up.',
      nextLessonMove: {
        title: 'Family map',
        minutes: 8,
        detail: 'Open with the Caulfields on the board.',
      },
    },
    responseCount: 3,
    generatedAt: '2026-11-02T15:00:00.000Z',
    current: true,
  };

  function renderWithData(
    props: Parameters<typeof ExitTicketClassReadPanel>[0]
  ) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const router = createMemoryRouter([
      { path: '/', element: <ExitTicketClassReadPanel {...props} /> },
    ]);
    act(() => {
      root!.render(<RouterProvider router={router} />);
    });
    return container;
  }

  function summaryButton(container: HTMLElement) {
    return container.querySelector<HTMLButtonElement>(
      '[data-testid="exit-ticket-summary"] button[type="submit"]'
    );
  }

  it('shows nothing of it while the flag is off', () => {
    const container = render({ read, planHref: null });
    expect(
      container.querySelector('[data-testid="exit-ticket-summary"]')
    ).toBeNull();
  });

  it('offers to summarize once there are enough responses', () => {
    const container = renderWithData({
      read,
      planHref: null,
      classAssignmentId: 'ca-1',
      summary: { stored: null, canGenerate: true },
    });
    const button = summaryButton(container)!;
    expect(button.textContent).toContain('Summarize responses');
    expect(button.disabled).toBe(false);
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="classAssignmentId"]'
      )?.value
    ).toBe('ca-1');
  });

  it('says how many responses it needs before then', () => {
    const container = renderWithData({
      read,
      planHref: null,
      classAssignmentId: 'ca-1',
      summary: { stored: null, canGenerate: false },
    });
    expect(summaryButton(container)!.disabled).toBe(true);
    expect(container.textContent).toContain('at least 3 responses');
  });

  it('shows a current summary, the call, and tomorrow’s opening, with nothing to click', () => {
    const container = renderWithData({
      read,
      planHref: null,
      classAssignmentId: 'ca-1',
      summary: { stored, canGenerate: true },
    });
    const text = container.textContent ?? '';
    expect(text).toContain(stored.summary.understood);
    expect(text).toContain('Some mix Allie up with D.B.');
    expect(text).toContain('Quick review');
    expect(text).toContain('Tomorrow: Family map');
    expect(text).toContain('(8 min)');
    expect(text).toContain('Every response is still in the list below.');
    expect(summaryButton(container)).toBeNull();
  });

  it('offers an update once new responses arrive', () => {
    const container = renderWithData({
      read,
      planHref: null,
      classAssignmentId: 'ca-1',
      summary: { stored: { ...stored, current: false }, canGenerate: true },
    });
    expect(summaryButton(container)!.textContent).toContain('Update summary');
    expect(container.textContent).toContain(
      'New responses have come in since.'
    );
  });
});
