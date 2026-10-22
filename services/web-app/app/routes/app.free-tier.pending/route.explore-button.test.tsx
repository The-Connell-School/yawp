import { renderToStaticMarkup } from 'react-dom/server';
import * as router from 'react-router';
import { afterAll, expect, mock, test } from 'bun:test';

afterAll(() => mock.restore());

function mockPage(loaderData: Record<string, unknown>) {
  mock.module('react-router', () => ({
    ...router,
    useLoaderData: () => loaderData,
    useActionData: () => undefined,
    useNavigation: () => ({ state: 'idle' }),
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  }));
}

const baseV2 = {
  app: { status: 'SENT', name: 'Teacher' },
  pending: { adminName: 'Patel', adminEmail: 'patel@example.org' },
  lastFailedEmail: null,
  showExploreClassroom: true,
  approvalV2: {
    enabled: true,
    approval: {
      id: 'current',
      adminName: 'Patel',
      adminEmail: 'patel@example.org',
    },
    firstSentAt: new Date('2026-10-14'),
  },
};

test('approval v2 SENT shows explore when preview membership gate would fail', async () => {
  mockPage({ ...baseV2, showExploreClassroom: true });
  const { default: Page } = await import('./route');
  const html = renderToStaticMarkup(<Page />);
  expect(html).toContain('Explore my classroom');
  expect(html).toContain('data-testid="locked-preview-explore"');
  expect(html).toContain('to="/app"');
  expect(html).not.toContain('/app/free-tier/preview');
});

test('approval v2 MANUAL_REVIEW shows explore without pending admin row', async () => {
  mockPage({
    ...baseV2,
    app: { status: 'MANUAL_REVIEW', name: 'Teacher' },
    pending: null,
    approvalV2: { enabled: true, approval: null, firstSentAt: null },
    showExploreClassroom: true,
  });
  const { default: Page } = await import('./route');
  const html = renderToStaticMarkup(<Page />);
  expect(html).toContain('Explore my classroom');
});

test('legacy pending path shows explore when showExploreClassroom is true', async () => {
  mockPage({
    app: { status: 'SENT', name: 'Teacher' },
    pending: { adminName: 'Patel', adminEmail: 'patel@example.org' },
    lastFailedEmail: null,
    showExploreClassroom: true,
    approvalV2: null,
  });
  const { default: Page } = await import('./route');
  const html = renderToStaticMarkup(<Page />);
  expect(html).toContain('Explore my classroom');
});

test('flag off hides explore via loader showExploreClassroom', async () => {
  mockPage({ ...baseV2, showExploreClassroom: false });
  const { default: Page } = await import('./route');
  const html = renderToStaticMarkup(<Page />);
  expect(html).not.toContain('Explore my classroom');
});

test('loader sets showExploreClassroom from pending teaching lock', async () => {
  mock.restore();
  const lock = mock(async () => true);
  mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
    requireFreeTierEnabled: async () => {},
  }));
  mock.module('~/utils/auth.server', () => ({
    requireUserId: async () => 'teacher-1',
  }));
  mock.module('~/domain/free-tier/locked-preview.server', () => ({
    userHasPendingFreeTierTeachingLock: lock,
  }));
  mock.module('~/utils/db.server', () => ({
    prisma: {
      freeTierApplication: {
        findFirst: async () => ({
          id: 'app',
          userId: 'teacher-1',
          organizationId: 'org-free',
          status: 'SENT',
          schoolName: 'Demo',
          email: 't@example.org',
          name: 'Teacher',
          adminApprovals: [
            { adminName: 'Admin', adminEmail: 'a@example.org' },
          ],
        }),
      },
      freeTierEmailLog: { findFirst: async () => null },
    },
  }));
  mock.module('~/domain/free-tier/approval-v2.server', () => ({
    getApprovalWaitingDetails: async () => null,
  }));
  const { loader } = await import('./route');
  const data = await loader({
    request: new Request('https://yawp.test/app/free-tier/pending'),
  } as never);
  expect(lock).toHaveBeenCalledWith('teacher-1');
  expect(data.showExploreClassroom).toBe(true);
  expect('lockedPreview' in data).toBe(false);
});
