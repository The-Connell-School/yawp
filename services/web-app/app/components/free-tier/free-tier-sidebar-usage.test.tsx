import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';

// Other suites mock this module without PopoverTrigger; give this suite a
// complete stand-in so it does not depend on test file order.
mock.module('~/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverAnchor: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: () => null,
}));

const { FreeTierSidebarUsage } = await import('./free-tier-sidebar-usage');

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

const count = (used: number, total: number) => ({
  used,
  total,
  remaining: Math.max(0, total - used),
});

const usage = (overrides: Partial<FreeAccountUsage> = {}) =>
  ({
    students: count(0, 30),
    assignments: [],
    lessonPlans: count(4, 5),
    lessonPlannerMonthly: count(4, 5),
    allAssignmentsUsed: false,
    warning: null,
    monthly: true,
    lessonPlannerMonthlyMetering: true,
    renewsAt: '2026-12-01T00:00:00.000Z',
    reporter: count(0, 2),
    classId: 'c1',
    checklist: {
      classReady: true,
      assignmentCreated: false,
      writingSubmitted: false,
      graded: false,
    },
    gradingPause: null,
    ...overrides,
  }) as FreeAccountUsage;

describe('FreeTierSidebarUsage (Meter A)', () => {
  test('mobile drawer opens "Usage this month" in place', () => {
    const container = renderTree(
      <FreeTierSidebarUsage
        usage={usage()}
        navExpanded
        mobileDrawer
        lessonPlannerAvailable
        loading={false}
      />
    );
    const trigger = container.querySelector(
      '[data-testid="free-tier-sidebar-usage"]'
    ) as HTMLButtonElement;
    expect(trigger.textContent).toBe('Usage');
    expect(container.textContent).not.toContain('Usage this month');
    act(() => trigger.click());
    const text = container.textContent ?? '';
    expect(text).toContain('Usage this month');
    expect(text).toContain('Renews Dec 1');
    expect(text).toContain('Lesson PlannerA few left');
    expect(text).toContain('ReporterPlenty left');
    expect(text).toContain('Need more? Talk to us');
    expect(text).not.toMatch(/\d+ of \d+/);
    const bars = [...container.querySelectorAll('[role="progressbar"]')];
    expect(bars.map((bar) => bar.getAttribute('aria-valuenow'))).toEqual([
      '20',
      '100',
    ]);
  });

  test('desktop row shows the label and chevron when the nav is expanded', () => {
    const container = renderTree(
      <FreeTierSidebarUsage
        usage={usage()}
        navExpanded
        mobileDrawer={false}
        lessonPlannerAvailable={false}
        loading={false}
      />
    );
    const trigger = container.querySelector(
      '[data-testid="free-tier-sidebar-usage"]'
    )!;
    expect(trigger.getAttribute('aria-label')).toBe('Usage');
    expect(trigger.textContent).toBe('Usage');
    expect(trigger.hasAttribute('data-nav-expanded')).toBe(true);
  });

  test('collapsed nav keeps an icon-only Usage button', () => {
    const container = renderTree(
      <FreeTierSidebarUsage
        usage={usage()}
        navExpanded={false}
        mobileDrawer={false}
        lessonPlannerAvailable
        loading={false}
      />
    );
    const trigger = container.querySelector(
      '[data-testid="free-tier-sidebar-usage"]'
    )!;
    expect(trigger.getAttribute('aria-label')).toBe('Usage');
    expect(trigger.textContent).toBe('');
  });

  test('renders nothing when there is no metered tool to show', () => {
    const container = renderTree(
      <FreeTierSidebarUsage
        usage={usage({ monthly: false, lessonPlannerMonthlyMetering: false })}
        navExpanded
        mobileDrawer={false}
        lessonPlannerAvailable
        loading={false}
      />
    );
    expect(container.innerHTML).toBe('');
  });
});
