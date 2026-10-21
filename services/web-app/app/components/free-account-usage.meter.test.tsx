import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import {
  LessonPlannerMonthlyLimitNotice,
  MonthlyUsageSidebarCard,
  monthlyUsageShowsMobileDot,
} from './free-account-usage';

const base: FreeAccountUsage = {
  monthly: true,
  reporterLocked: true,
  renewsAt: '2026-11-01T00:00:00.000Z',
  students: { used: 0, total: 35, remaining: 35 },
  lessonPlans: { used: 0, total: 5, remaining: 5 },
  reporter: { used: 0, total: 2, remaining: 2 },
  assignments: [],
  allAssignmentsUsed: false,
  warning: null,
  classId: null,
  checklist: {
    classReady: true,
    assignmentCreated: false,
    writingSubmitted: false,
    graded: false,
  },
  gradingPause: null,
};

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <StaticRouter location="/app">{node}</StaticRouter>
  );
}

test('pending monthly card shows percentages and locked reporter row', () => {
  const html = render(<MonthlyUsageSidebarCard usage={base} />);
  expect(html).toContain('Monthly usage');
  expect(html).toContain('0%');
  expect(html).toContain('Unlocks after approval');
  expect(html).not.toContain('Students');
  expect(html).toContain('Renews November 1');
});

for (const [used, label, expectWarning] of [
  [3, '60', false],
  [5, '100', true],
  [9, '90', true],
] as const) {
  test(`lesson planner meter at ${label}%`, () => {
    const total = label === '90' ? 10 : 5;
    const usage = {
      ...base,
      lessonPlans: {
        used,
        total,
        remaining: total - used,
      },
    };
    const html = render(<MonthlyUsageSidebarCard usage={usage} />);
    expect(html).toContain(`${Math.round((used / total) * 100)}%`);
    if (expectWarning) {
      expect(
        html.includes('Almost at this month') ||
          html.includes('Lesson Planner limit reached')
      ).toBe(true);
    }
  });
}

test('mobile menu dot appears at 90% or above', () => {
  expect(monthlyUsageShowsMobileDot(base)).toBe(false);
  expect(
    monthlyUsageShowsMobileDot({
      ...base,
      lessonPlans: { used: 9, total: 10, remaining: 1 },
    })
  ).toBe(true);
});

test('lesson planner limit notice matches approved copy', () => {
  const html = render(
    <LessonPlannerMonthlyLimitNotice
      usage={{
        ...base,
        lessonPlans: { used: 5, total: 5, remaining: 0 },
      }}
    />
  );
  expect(html).toContain(
    'You&#x27;ve reached this month&#x27;s Lesson Planner limit'
  );
  expect(html).toContain('Renews November 1. Unlimited with a site license.');
  expect(html).toContain('Talk to us');
});
