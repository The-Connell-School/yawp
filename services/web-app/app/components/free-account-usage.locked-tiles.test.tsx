import { expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';

mock.module('~/components/student-invitation-dialog', () => ({
  StudentInvitationDialog: () => null,
}));

const { FreeAssignmentTiles } = await import('./free-account-usage');

const usage: FreeAccountUsage = {
  monthly: true,
  students: { used: 0, total: 35, remaining: 35 },
  lessonPlans: { used: 0, total: 5, remaining: 5 },
  assignments: [
    {
      kind: 'class_starter',
      label: 'Class Starter',
      used: 0,
      total: 12,
      remaining: 12,
    },
  ],
  allAssignmentsUsed: false,
  warning: null,
  classId: 'class-1',
  checklist: {
    classReady: false,
    assignmentCreated: false,
    writingSubmitted: false,
    graded: false,
  },
  gradingPause: null,
};

test('FreeAssignmentTiles renders site-license locked tiles after entitled rows', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        usage={usage}
        types={[{ id: 'starter', kind: 'class_starter' }]}
        lockedAssignmentTiles={[
          {
            key: 'daily_pages',
            label: 'Daily Pages',
            assignmentTypeId: 'daily',
          },
        ]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).toContain('data-testid="free-assignment-tiles"');
  expect(html).toContain('Daily Pages');
  expect(html).toContain('site-license-lock-button');
  expect(html).not.toContain('Available with a site license.');
});

test('FreeAssignmentTiles omits locked tiles when the list is empty', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        usage={usage}
        types={[{ id: 'starter', kind: 'class_starter' }]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).not.toContain('site-license-locked-assignment-tile');
});
