import { afterAll, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import { FREE_TIER_NEEDS_GRADING_DOCUMENTS_HREF } from '~/domain/free-tier/getting-started-grade';
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
test('Advocate Pack stays hidden until the teacher grades and stays off legacy usage', () => {
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
  expect(html).toContain('First assignment created');
  expect(html).not.toContain('Give your first assignment');
  expect(html).not.toContain('Tell a colleague');
  expect(html).not.toContain('Share with a colleague');
  const enrolledNotGraded = {
    ...noStudents,
    students: { ...count, used: 1 },
    checklist: {
      ...noStudents.checklist,
      writingSubmitted: true,
      graded: false,
    },
  };
  const stillOnChecklist = render(<FreeAccountRail usage={enrolledNotGraded} />);
  expect(stillOnChecklist).toContain('Grade your first submission');
  expect(stillOnChecklist).not.toContain('Share with a colleague');
  expect(stillOnChecklist).toContain('data-testid="free-account-checklist"');
  const withGrade = {
    ...enrolledNotGraded,
    checklist: {
      ...enrolledNotGraded.checklist,
      graded: true,
    },
  };
  const enrolled = render(<FreeAccountRail usage={withGrade} />);
  expect(enrolled).toContain('Tell a colleague');
  expect(enrolled).not.toContain('free-account-checklist');
  expect(enrolled).toContain('Share with a colleague');
  expect(
    render(<FreeAccountRail usage={{ ...withGrade, monthly: false }} />)
  ).not.toContain('Share with a colleague');
});
test('grade step CTA deep-links to the first to-grade submission when provided', () => {
  const gradeHref = `/app/submissions/sub-first?edit=1&exitTo=${encodeURIComponent(
    FREE_TIER_NEEDS_GRADING_DOCUMENTS_HREF
  )}`;
  const html = render(
    <FreeAccountRail
      usage={{
        ...usage,
        students: { ...count, used: 1 },
        gradeStepHref: gradeHref,
        checklist: {
          classReady: true,
          assignmentCreated: true,
          writingSubmitted: true,
          graded: false,
        },
      }}
    />
  );
  expect(html).toContain('data-testid="checklist-grade-first-submission"');
  expect(html).toContain('/app/submissions/sub-first?edit=1');
  expect(html).toContain(
    'exitTo=%2Fapp%2Fdocuments%3Fstatus%3Dneeds-grading%26reset%3D1'
  );
});
test('grade step CTA falls back to the needs-grading documents list', () => {
  const html = render(
    <FreeAccountRail
      usage={{
        ...usage,
        students: { ...count, used: 1 },
        checklist: {
          classReady: true,
          assignmentCreated: true,
          writingSubmitted: true,
          graded: false,
        },
      }}
    />
  );
  expect(html).toContain('href="/app/documents?status=needs-grading&amp;reset=1"');
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
  expect(html).toContain('Step 3 of 4');
  expect(html).toContain('Class ready');
  const assignmentIdx = html.indexOf('First assignment created');
  const studentsIdx = html.indexOf('Add your students');
  const fourthIdx = html.indexOf('Grade your first submission');
  expect(assignmentIdx).toBeGreaterThan(-1);
  expect(studentsIdx).toBeGreaterThan(assignmentIdx);
  expect(fourthIdx).toBeGreaterThan(studentsIdx);
});
test('monthly checklist hides invite panel until assignment exists and prompts to create', () => {
  const html = render(
    <FreeAccountRail
      usage={{
        ...usage,
        classCode: 'DEV-CLASS-101',
        classId: 'class-1',
        students: { ...count, used: 0 },
        checklist: {
          classReady: true,
          assignmentCreated: false,
          writingSubmitted: false,
          graded: false,
        },
      }}
      classStarterAssignmentTypeId="type-class-starter"
    />
  );
  expect(html).toContain('Create your first assignment');
  expect(html).toContain('data-testid="checklist-create-first-assignment"');
  expect(html).toContain('/app/assignments/new?first=1');
  expect(html).toContain('assignmentTypeId=type-class-starter');
  expect(html).toContain('classId=class-1');
  expect(html).not.toContain('Invite students');
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
