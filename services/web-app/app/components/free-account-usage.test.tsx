import { afterAll, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
mock.module('~/components/student-invitation-dialog', () => ({
  StudentInvitationDialog: () => null,
}));
const { MonthlyUsageNotice, FreeAccountRail, FreeReporterLocked } =
  await import('./free-account-usage');
afterAll(() => mock.restore());
const count = { used: 0, total: 5, remaining: 5 };
const usage: FreeAccountUsage = {
  monthly: true,
  renewsAt: '2027-01-01T00:00:00.000Z',
  students: count,
  lessonPlans: count,
  reporter: { ...count, total: 2, remaining: 2 },
  assignments: [],
  allAssignmentsUsed: false,
  warning: null,
  classId: null,
  checklist: {
    classReady: false,
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
test('both meters always show monthly allowances and the actual UTC renewal date', () => {
  for (const feature of ['lesson-planner', 'reporter'] as const) {
    const html = render(<MonthlyUsageNotice usage={usage} feature={feature} />);
    expect(html).toContain(
      'Your free classroom includes 5 lesson plans and 2 reports each month. Renews January 1.'
    );
    expect(html).toContain('Unlimited with a site license');
    expect(html).not.toContain('Share YAWP!');
  }
});
test('one remaining and exhausted copy use each feature name, renewal and saved-work reassurance', () => {
  for (const [feature, key, singular, plural] of [
    ['lesson-planner', 'lessonPlans', 'lesson plan', 'lesson plans'],
    ['reporter', 'reporter', 'report', 'reports'],
  ] as const) {
    const near = { ...usage, [key]: { ...count, remaining: 1 } };
    expect(
      render(<MonthlyUsageNotice usage={near} feature={feature} />)
    ).toContain(
      `You have one ${singular} left this month. It renews January 1.`
    );
    const exhausted = { ...usage, [key]: { ...count, remaining: 0 } };
    const html = render(
      <MonthlyUsageNotice usage={exhausted} feature={feature} />
    );
    expect(html).toContain(
      `You&#x27;ve used this month&#x27;s free ${plural}. They renew January 1, and everything you&#x27;ve already made is still here.`
    );
    expect(html).toContain('Unlimited with a site license.');
    expect(html).toContain('href="/app/advocate-pack"');
    expect(html).toContain('Share YAWP! with my administrator');
    expect(html).toContain('Learn about site licenses');
  }
});
test('monthly guidance is absent with the monthly flag off', () => {
  expect(
    render(
      <MonthlyUsageNotice
        usage={{ ...usage, monthly: false }}
        feature="reporter"
      />
    )
  ).toBe('');
});
test('Advocate Pack follows incomplete first steps, leads after completion, and stays hidden for legacy usage', () => {
  const html = render(<FreeAccountRail usage={usage} />);
  expect(html.indexOf('free-account-checklist')).toBeLessThan(
    html.indexOf('Loving what YAWP!')
  );
  expect(html).toContain(
    'Our Advocate Pack makes it easy to share what you&#x27;re seeing with your administrator.'
  );
  expect(html).toContain('Get the Advocate Pack');
  const done = {
    ...usage,
    students: { ...count, used: 1 },
    checklist: {
      classReady: true,
      assignmentCreated: true,
      writingSubmitted: true,
      graded: true,
    },
  };
  const complete = render(<FreeAccountRail usage={done} />);
  expect(complete.indexOf('Loving what YAWP!')).toBeLessThan(
    complete.indexOf('free-account-checklist')
  );
  expect(
    render(<FreeAccountRail usage={{ ...done, monthly: false }} />)
  ).not.toContain('Get the Advocate Pack');
});
test('Reporter card uses site-license language', () => {
  const html = render(<FreeReporterLocked />);
  expect(html).toContain('Reporter comes with a YAWP! site license');
  expect(html).not.toContain('paid plan');
});
