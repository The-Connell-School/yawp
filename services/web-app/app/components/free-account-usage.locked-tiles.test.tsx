import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { afterEach, expect, mock, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';

mock.module('~/components/student-invitation-dialog', () => ({
  StudentInvitationDialog: () => null,
}));

const { FreeAssignmentTiles } = await import('./free-account-usage');

let lockedTileRoot: Root | null = null;

afterEach(() => {
  act(() => lockedTileRoot?.unmount());
  lockedTileRoot = null;
  document.body.innerHTML = '';
});

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
          {
            id: 'starter',
            kind: 'class_starter',
            imageId: 'img-starter',
          },
          { id: 'pre', kind: 'prewriting', imageId: 'img-pre' },
          {
            id: 'thesis',
            kind: 'thesis_statement',
            imageId: 'img-thesis',
          },
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
  expect(html).toContain('/api/image/course/img-starter');
});

test('FreeAssignmentTiles renders assignment artwork when imageId is present', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        usage={usage}
        types={[{ id: 'starter', kind: 'class_starter', imageId: 'img-1' }]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).toContain('src="/api/image/course/img-1"');
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

test('FreeAssignmentTiles unlocked tiles link to assignment type home', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        usage={usage}
        types={[
          {
            id: 'starter',
            kind: 'class_starter',
            imageId: 'img-starter',
          },
          { id: 'pre', kind: 'prewriting', imageId: 'img-pre' },
          {
            id: 'thesis',
            kind: 'thesis_statement',
            imageId: 'img-thesis',
          },
        ]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).toContain('href="/app/assignment-types/starter"');
  expect(html).toContain('href="/app/assignment-types/pre"');
  expect(html).toContain('href="/app/assignment-types/thesis"');
  expect(html.match(/data-testid="dashboard-assignment-tile"/g)).toHaveLength(3);
  expect(html).not.toMatch(
    /<button[^>]*data-testid="dashboard-assignment-tile"/
  );
});

test('FreeAssignmentTiles locked tiles link to assignment type home', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        usage={usage}
        teachingLocked
        types={[
          { id: 'starter', kind: 'class_starter', imageId: 'img-1' },
          { id: 'pre', kind: 'prewriting', imageId: 'img-2' },
          { id: 'thesis', kind: 'thesis_statement', imageId: 'img-3' },
        ]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).toContain('href="/app/assignment-types/starter"');
  expect(html).toContain('href="/app/assignment-types/thesis"');
  expect(html).not.toMatch(
    /<button[^>]*data-testid="dashboard-assignment-tile"/
  );
});

test('FreeAssignmentTiles locked pending hides create control and uses text-only tiles', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        usage={usage}
        teachingLocked
        types={[
          { id: 'starter', kind: 'class_starter', imageId: 'img-1' },
          { id: 'pre', kind: 'prewriting', imageId: 'img-2' },
          { id: 'thesis', kind: 'thesis_statement', imageId: 'img-3' },
        ]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).not.toContain('preview-assignment-creation-disabled');
  expect(html).not.toContain('Create assignment');
  expect(html).not.toContain('/api/image/course/');
  expect(html).toContain('site-license-lock-button');
  expect(html).toContain('12 of 12 left');
  expect(html).not.toContain('Unlimited');
});

test('FreeAccountRail is hidden while teaching is locked', async () => {
  mock.module('~/components/free-tier/teaching-access-context', () => ({
    useTeachingAccess: () => ({
      locked: true,
      loading: false,
      state: { variant: 'locked', adminName: 'Dr. Patel' },
    }),
  }));
  const { FreeAccountRail } = await import('./free-account-usage');
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAccountRail usage={usage} />
    </StaticRouter>
  );
  expect(html).toBe('');
  mock.restore();
});
