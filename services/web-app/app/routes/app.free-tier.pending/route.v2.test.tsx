import { renderToStaticMarkup } from 'react-dom/server';
import * as router from 'react-router';
import { afterAll, expect, mock, test } from 'bun:test';
let enabled = true;
const forward = mock(async (_args: any) => ({ ok: true, queued: true }));
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/utils/auth.server', () => ({
  requireUserId: async () => 'owner',
}));
mock.module('~/utils/db.server', () => ({
  prisma: {
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

test('pending page offers draft request mailto, explore, and forward without legacy resend', () => {
  stopped = false;
  const html = renderToStaticMarkup(<Page />);
  expect(html).toContain('Explore my classroom');
  expect(html).toContain('Not the right person?');
  expect(html).toContain('Draft a Request');
  expect(html).toContain('data-testid="pending-draft-request"');
  expect(html).toContain(
    'href="mailto:very.long.administrator.email.address%2Btag%40subdomain.example-school.edu?'
  );
  expect(html).toContain('Lincoln%20High%20School');
  expect(html).toContain('transactional-from%40example.org');
  expect(html).toContain('start%20writing%20with%20Yawp!');
  expect(html).not.toContain('with%20Yawp!.');
  expect(html).toContain('free-tier-draft-request');
  expect(html).not.toContain('lucide-mail');
  expect(html).toContain('Explore my classroom');
  const progressIdx = html.indexOf('aria-label="Approval progress"');
  const personIdx = html.indexOf('free-tier-person-email');
  const draftIdx = html.indexOf('pending-draft-request');
  const exploreIdx = html.indexOf('locked-preview-explore');
  expect(progressIdx).toBeGreaterThan(-1);
  expect(personIdx).toBeGreaterThan(progressIdx);
  expect(draftIdx).toBeGreaterThan(personIdx);
  expect(exploreIdx).toBeGreaterThan(draftIdx);
  expect(html).not.toContain('Resend reminder');
  expect(html).not.toContain('Draft an email');
  expect(html).not.toContain('Take a look around');
  expect(html).toContain('[overflow-wrap:anywhere]');
  expect(html).toContain('data-testid="free-tier-person-email"');
  expect(html).toContain('Account and class created');
});
