import * as router from 'react-router';
import { expect, mock, test } from 'bun:test';
import {
  mockCardPageChromeForSsr,
  renderWithCardPageChrome,
} from '~/components/card-page-chrome.ssr-test-setup';

mockCardPageChromeForSsr();
const forward = mock(async (_args: Record<string, unknown>) => ({
  ok: true,
  queued: true,
  adminName: 'Alex Kim',
}));
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/utils/auth.server', () => ({
  requireUserId: async () => 'teacher-1',
}));
mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: {
      findFirst: async ({
        where,
      }: {
        where?: { status?: string | { in?: string[] } };
      }) => {
        if (where?.status === 'ACCOUNT_CREATED') return null;
        return {
          id: 'app-1',
          userId: 'teacher-1',
          organizationId: 'org-1',
          status: 'SENT',
        };
      },
    },
    freeTierAdminApproval: { findFirst: async () => null },
    freeTierEmailLog: { findFirst: async () => null },
    orgMembership: { findFirst: async () => null },
    setting: { findUnique: async () => null },
  },
}));
mock.module('~/domain/free-tier/class-preparation.server', () => ({
  isClassPreparationEnabled: async () => false,
}));
mock.module('~/domain/free-tier/approval-deny.server', () => ({
  loadTeacherDeniedSurface: async () => ({
    app: { id: 'app-1', schoolName: 'Lincoln High School' },
    denied: {
      id: 'denied-1',
      adminName: 'Dana',
      adminEmail: 'dana@lincoln.edu',
      decidedAt: new Date('2026-11-21T12:00:00Z'),
    },
    forwardsRemaining: 2,
    chainCapReached: false,
    askAnotherHint: '2 of 3 requests left',
  }),
}));
mock.module('~/domain/free-tier/approval-v2.server', () => ({
  isApprovalV2Enabled: async () => true,
  getApprovalWaitingDetails: async () => ({
    enabled: true,
    approval: null,
    firstSentAt: null,
  }),
  forwardApprovalRequest: forward,
}));
mock.module('~/utils/rate-limit.server', () => ({
  enforceUnauthByIpAndTarget: async () => ({ allowed: true }),
}));
mock.module('~/domain/free-tier/approval-flow.server', () => ({
  resendFreeTierAdminApprovalReminder: async () => ({ ok: true }),
}));
mock.module('~/domain/free-tier/locked-preview.server', () => ({
  userHasPendingFreeTierTeachingLock: async () => false,
}));
mock.module('~/domain/free-tier/e2e-stub.server', () => ({
  yawpE2eForwardShouldFail: () => false,
}));
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => ({
    app: {
      status: 'SENT',
      name: 'Danielle Cabibbo',
      schoolName: 'Lincoln High School',
    },
    pending: null,
    lastFailedEmail: null,
    showExploreClassroom: false,
    approvalV2: { enabled: true, approval: null, firstSentAt: null },
    teacherDenied: {
      denied: {
        id: 'denied-1',
        adminName: 'Dana',
        adminEmail: 'dana@lincoln.edu',
      },
      chainCapReached: false,
      askAnotherHint: '2 of 3 requests left',
    },
    askOpen: true,
    additionalSentAdmin: null,
  }),
  useActionData: () => undefined,
  useFetcher: () => ({ state: 'idle', data: undefined, submit: () => {} }),
  useRevalidator: () => ({ revalidate: () => {} }),
  useNavigation: () => ({ state: 'idle' }),
  Form: ({ children, ...props }: { children?: unknown }) => (
    <form {...props}>{children as never}</form>
  ),
  Link: ({ children, ...props }: { children?: unknown }) => (
    <a {...props}>{children as never}</a>
  ),
}));

const { action, default: Page } = await import('./route');

test('a denied teacher can ask a different administrator from the deny screen', async () => {
  const html = renderWithCardPageChrome(<Page />);
  expect(html).toContain('wasn&#x27;t approved');
  expect(html).toContain('ask another administrator');
  expect(html).toContain('name="adminName"');
  expect(html).toContain('name="approvalId" value="denied-1"');
  const result = await action({
    request: new Request('http://localhost/app/free-tier/pending', {
      method: 'POST',
      body: new URLSearchParams({
        intent: 'forward',
        approvalId: 'denied-1',
        adminName: 'Alex Kim',
        adminEmail: 'alex@lincoln.edu',
        adminRole: 'Principal',
      }),
    }),
  } as never);
  expect(result).toMatchObject({ ok: true, queued: true });
  expect(forward.mock.calls[0]?.[0]).toMatchObject({
    userId: 'teacher-1',
    applicationId: 'app-1',
    currentApprovalId: 'denied-1',
    newAdminName: 'Alex Kim',
    newAdminEmail: 'alex@lincoln.edu',
    keepPreviousPending: true,
  });
});
