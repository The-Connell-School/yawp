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
    {
      kind: 'prewriting',
      label: 'Prewriting',
      used: 0,
      total: 12,
      remaining: 12,
    },
    {
      kind: 'thesis_statement',
      label: 'Thesis Statement',
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

test('FreeAssignmentTiles renders only entitled free assignment rows on the dashboard', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        usage={usage}
        types={[
          { id: 'starter', kind: 'class_starter' },
          { id: 'pre', kind: 'prewriting' },
          { id: 'thesis', kind: 'thesis_statement' },
        ]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).toContain('data-testid="free-assignment-tiles"');
  expect(html.match(/data-testid="dashboard-assignment-tile"/g)).toHaveLength(3);
  expect(html).toContain('Class Starter');
  expect(html).toContain('Prewriting');
  expect(html).toContain('Thesis Statement');
  expect(html).not.toContain('site-license-locked-assignment-tile');
  expect(html).not.toContain('Daily Pages');
});

test('FreeAssignmentTiles shows Unlimited meta for monthly free assignments', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        usage={usage}
        types={[{ id: 'starter', kind: 'class_starter' }]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).toContain('Unlimited');
  expect(html).not.toContain('site-license-lock-button');
});
