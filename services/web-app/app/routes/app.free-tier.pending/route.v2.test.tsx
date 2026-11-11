import * as router from 'react-router';
import { afterAll, expect, mock, test } from 'bun:test';
import {
  mockCardPageChromeForSsr,
  renderWithCardPageChrome,
} from '~/components/card-page-chrome.ssr-test-setup';
import { featureFlagPrismaTables } from '~/domain/feature-flags/feature-flags.server.test-support';
mockCardPageChromeForSsr();
let enabled = true;
const forward = mock(async (_args: any) => ({ ok: true, queued: true }));
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/utils/auth.server', () => ({
  requireUserId: async () => 'owner',
}));
const featureFlagTables = featureFlagPrismaTables();
mock.module('~/utils/db.server', () => ({
  prisma: {
    ...featureFlagTables,
    orgMembership: { findFirst: async () => null },
    freeTierApplication: {
      findFirst: async () => ({
        id: 'app',
        status: 'SENT',
        userId: 'owner',
        organizationId: null,
      }),
    },
    freeTierEmailLog: { findFirst: async () => null },
  },
}));
mock.module('~/domain/free-tier/class-preparation.server', () => ({
  isClassPreparationEnabled: async () => false,
}));
mock.module('~/domain/free-tier/approval-deny.server', () => ({
  loadTeacherDeniedSurface: async () => null,
}));
mock.module('~/domain/free-tier/approval-v2.server', () => ({
  isApprovalV2Enabled: async () => enabled,
  getApprovalWaitingDetails: async () =>
    enabled
      ? {
          enabled: true,
          approval: {
            id: 'current',
            adminName: 'Patel',
            adminEmail:
              'very.long.administrator.email.address+tag@subdomain.example-school.edu',
          },
          firstSentAt: new Date('2026-10-14'),
        }
      : null,
  forwardApprovalRequest: forward,
}));
mock.module('~/utils/rate-limit.server', () => ({
  enforceUnauthByIpAndTarget: async () => ({ allowed: true }),
}));
mock.module('~/domain/free-tier/approval-flow.server', () => ({
  resendFreeTierAdminApprovalReminder: async () => ({ ok: true }),
}));
mock.module('~/domain/free-tier/locked-preview.server', () => ({
  getLockedPreviewApplication: async () => ({ id: 'app' }),
}));
mock.module('~/cookies/membership-id.server', () => ({
  getMembershipId: async () => null,
}));
let stopped = false;
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => ({
    app: {
      status: 'SENT',
      name: 'Teacher',
      schoolName: 'Lincoln High School',
    },
    pending: {
      adminName: 'Patel',
      adminEmail:
        'very.long.administrator.email.address+tag@subdomain.example-school.edu',
    },
    showExploreClassroom: true,
    approvalEmailFrom: 'transactional-from@example.org',
    approvalV2: {
      approval: {
        id: 'current',
        adminName: 'Patel',
        adminEmail:
          'very.long.administrator.email.address+tag@subdomain.example-school.edu',
        autoRemindersStopped: stopped,
      },
      firstSentAt: new Date('2026-10-14'),
    },
  }),
  useActionData: () => undefined,
  useNavigation: () => ({ state: 'idle' }),
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
const { default: Page, action, loader } = await import('./route');
afterAll(() => mock.restore());
function request() {
  return new Request('http://localhost/app/free-tier/pending', {
    method: 'POST',
    body: new URLSearchParams({
      intent: 'forward',
      approvalId: 'current',
      adminName: 'Patel',
      adminEmail: 'patel@example.org',
    }),
  });
}
test('forward action passes authenticated owner and expected current approval', async () => {
  const result = await action({ request: request() } as never);
  expect(result.ok).toBe(true);
  expect(forward.mock.calls[0]?.[0]).toMatchObject({
    userId: 'owner',
    applicationId: 'app',
    currentApprovalId: 'current',
    newAdminName: 'Patel',
  });
});
test('crafted forward is refused when rollout is off', async () => {
  enabled = false;
  forward.mockReset();
  const result = await action({ request: request() } as never);
  expect(result.ok).toBe(false);
  expect(forward).not.toHaveBeenCalled();
});

test('pending page offers additional administrator link and explore without legacy resend', () => {
  stopped = false;
  const html = renderWithCardPageChrome(<Page />);
  expect(html).toContain('Explore my classroom');
  expect(html).toContain(
    'Not the right person? / Send to an additional administrator'
  );
  expect(html).toContain('data-testid="pending-additional-administrator-link"');
  expect(html).toContain('/app/free-tier/onboarding?additional=1');
  expect(html).not.toContain('Draft a Request');
  expect(html).not.toContain('pending-forward-disclosure');
  expect(html).not.toContain('mailto:');
  const progressIdx = html.indexOf('aria-label="Approval progress"');
  const personIdx = html.indexOf('free-tier-person-email');
  const linkIdx = html.indexOf('pending-additional-administrator-link');
  const exploreIdx = html.indexOf('locked-preview-explore');
  expect(progressIdx).toBeGreaterThan(-1);
  expect(personIdx).toBeGreaterThan(progressIdx);
  expect(linkIdx).toBeGreaterThan(personIdx);
  expect(exploreIdx).toBeGreaterThan(linkIdx);
  expect(html).not.toContain('Resend reminder');
  expect(html).not.toContain('Draft an email');
  expect(html).not.toContain('Take a look around');
  expect(html).toContain('[overflow-wrap:anywhere]');
  expect(html).toContain('data-testid="free-tier-person-email"');
  expect(html).toContain('Account and class created');
});
