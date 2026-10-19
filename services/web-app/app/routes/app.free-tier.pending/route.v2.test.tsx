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
mock.module('~/domain/free-tier/approval-v2.server', () => ({
  isApprovalV2Enabled: async () => enabled,
  getApprovalWaitingDetails: async () =>
    enabled
      ? {
          enabled: true,
          approval: { id: 'current' },
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
let stopped = false;
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => ({
    app: { status: 'SENT', name: 'Teacher' },
    approvalV2: {
      approval: {
        id: 'current',
        adminName: 'Patel',
        adminEmail: 'patel@example.org',
        autoRemindersStopped: stopped,
      },
    },
  }),
  useActionData: () => undefined,
  useNavigation: () => ({ state: 'idle' }),
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
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
  forward.mockClear();
  const result = await action({ request: request() } as never);
  expect(result.ok).toBe(false);
  expect(forward).not.toHaveBeenCalled();
});

test('pending guidance describes three weekly reminders and offers a different administrator after they stop', () => {
  stopped = false;
  expect(renderToStaticMarkup(<Page />)).toContain('up to three times');
  stopped = true;
  const html = renderToStaticMarkup(<Page />);
  expect(html).toContain(
    'Weekly reminders have stopped. You can pick a different administrator below or contact support@yawp.school for help.'
  );
  expect(html).toContain('Forward this request');
});
