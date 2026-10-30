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
import {
  FREE_TIER_UNLIMITED_TILE_LABEL,
  SITE_LICENSE_ONLY_TILE_LABEL,
} from '~/domain/free-tier/locked-dashboard-copy';

mock.module('~/components/student-invitation-dialog', () => ({
  StudentInvitationDialog: () => null,
}));

mock.module('~/components/free-tier/teaching-access-context', () => ({
  useTeachingAccess: () => ({
    locked: false,
    loading: false,
    state: { variant: 'none' },
  }),
}));

const { FreeAssignmentTiles, FreeAccountRail } = await import('./free-account-usage');

let lockedTileRoot: Root | null = null;

afterEach(() => {
  act(() => lockedTileRoot?.unmount());
  lockedTileRoot = null;
  document.body.innerHTML = '';
});

const usage: FreeAccountUsage = {
  monthly: true,
  unlimitedFreeAssignmentTiles: true,
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

test('FreeAssignmentTiles locked tiles link to how-it-works with PE3 labels', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <FreeAssignmentTiles
        usage={usage}
        teachingLocked
        assignmentsSeeHowItWorksTo="/app/assignment-types/starter/how-it-works"
        siteLicenseLockedAssignmentTiles={[
          {
            key: 'daily_pages',
            label: 'Daily Pages',
            assignmentTypeId: 'daily',
            imageId: 'img-daily',
          },
        ]}
        types={[
          { id: 'starter', kind: 'class_starter', imageId: 'img-1' },
          { id: 'pre', kind: 'prewriting', imageId: 'img-2' },
          { id: 'thesis', kind: 'thesis_statement', imageId: 'img-3' },
        ]}
        onCreate={() => {}}
      />
    </StaticRouter>
  );
  expect(html).toContain('href="/app/assignment-types/starter/how-it-works"');
  expect(html).toContain('href="/app/assignment-types/pre/how-it-works"');
  expect(html).toContain('href="/app/assignment-types/thesis/how-it-works"');
  expect(html).toContain('href="/app/assignment-types/daily/how-it-works"');
  expect(html).toContain(FREE_TIER_UNLIMITED_TILE_LABEL);
  expect(html).toContain(SITE_LICENSE_ONLY_TILE_LABEL);
  expect(html).toContain('/api/image/course/img-1');
  expect(html).toContain('data-testid="site-license-locked-assignment-tile"');
  expect(html).not.toContain('site-license-lock-button');
  expect(html).not.toContain('12 of 12 left');
});

test('FreeAccountRail shows pending card and getting started while teaching is locked', async () => {
  mock.module('react-router', () => ({
    ...require('react-router'),
    useFetcher: () => ({
      state: 'idle',
      data: undefined,
      Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    }),
    useRevalidator: () => ({ revalidate: () => {} }),
  }));
  mock.module('~/components/free-tier/teaching-access-context', () => ({
    useTeachingAccess: () => ({
      locked: true,
      loading: false,
      state: {
        variant: 'locked',
        applicationId: 'app-1',
        adminName: 'Dr. Patel',
        adminEmail: 'principal@example.test',
        pendingApprovalId: 'approval-1',
        schoolName: 'Lincoln High',
        approvalFirstSentAt: '2026-10-14T15:00:00.000Z',
        forwardDisclosureAvailable: true,
      },
    }),
  }));
  const { FreeAccountRail: Rail } = await import('./free-account-usage');
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <Rail usage={usage} />
    </StaticRouter>
  );
  expect(html).toContain('data-testid="free-account-rail"');
  expect(html).toContain('data-testid="locked-dashboard-pending-card"');
  expect(html).toContain('data-testid="locked-dashboard-getting-started"');
  expect(html).not.toContain('data-testid="free-account-checklist"');
  expect(html).toContain('Send to an additional administrator');
  expect(html).not.toContain('/app/free-tier/pending?ask=1');
  mock.restore();
});
