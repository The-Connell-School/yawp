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
    expect(html).not.toContain('Share Yawp!');
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
    expect(html).toContain('Share Yawp! with my administrator');
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
test('Advocate Pack stays hidden until a student joins and stays off legacy usage', () => {
  const noStudents = {
    ...usage,
    checklist: {
      classReady: true,
      assignmentCreated: true,
      writingSubmitted: false,
      graded: false,
    },
  };
  const html = render(<FreeAccountRail usage={noStudents} />);
  expect(html).toContain('Create your first assignment');
  expect(html).not.toContain('Give your first assignment');
  expect(html).not.toContain('Loving what Yawp!');
  expect(html).not.toContain('Get the Advocate Pack');
  const withStudent = {
    ...noStudents,
    students: { ...count, used: 1 },
    checklist: {
      ...noStudents.checklist,
      writingSubmitted: true,
      graded: true,
    },
  };
  const enrolled = render(<FreeAccountRail usage={withStudent} />);
  expect(enrolled).toContain('Loving what Yawp!');
  expect(enrolled.indexOf('free-account-checklist')).toBeLessThan(
    enrolled.indexOf('Loving what Yawp!')
  );
  expect(enrolled).toContain('Get the Advocate Pack');
  expect(
    render(<FreeAccountRail usage={{ ...withStudent, monthly: false }} />)
  ).not.toContain('Get the Advocate Pack');
});
test('monthly first steps order and two-of-four progress after class and assignment', () => {
  const html = render(
    <FreeAccountRail
      usage={{
        ...usage,
        students: { ...count, used: 0 },
        checklist: {
          classReady: true,
          assignmentCreated: true,
          writingSubmitted: false,
          graded: false,
        },
      }}
    />
  );
  expect(html).toContain('2 of 4');
  expect(html).toContain('Your class is ready');
  const assignmentIdx = html.indexOf('Create your first assignment');
  const studentsIdx = html.indexOf('Add your students to your class');
  const fourthIdx = html.indexOf('See what your class needs');
  expect(assignmentIdx).toBeGreaterThan(-1);
  expect(studentsIdx).toBeGreaterThan(assignmentIdx);
  expect(fourthIdx).toBeGreaterThan(studentsIdx);
});
test('Reporter pending lock copy matches approval gate', () => {
  const html = render(<FreeReporterLocked variant="pending" />);
  expect(html).toContain('Unlocks after approval');
  expect(html).not.toContain('paid plan');
});
test('Reporter site-license variant keeps upgrade language', () => {
  const html = render(<FreeReporterLocked variant="site-license" />);
  expect(html).toContain('Reporter comes with a Yawp! site license');
});
