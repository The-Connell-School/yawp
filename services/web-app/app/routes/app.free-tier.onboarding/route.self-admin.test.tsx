import { afterAll, beforeEach, expect, mock, test } from 'bun:test';

const realDb = { ...(await import('~/utils/db.server')) };
const realAuth = globalThis.__realModules['~/utils/auth.server'];
const realEmail = { ...(await import('~/domain/free-tier/email.server')) };
const realGate = {
  ...(await import('~/utils/free-tier/free-tier-feature-gate.server')),
};
const realFlow = {
  ...(await import('~/domain/free-tier/approval-flow.server')),
};
const findFirst = mock(async (_args: unknown) => ({
  id: 'self-admin-application',
  status: 'ACCOUNT_CREATED',
  email: 'Teacher+account@gmail.com',
  name: 'Teacher',
  schoolName: 'Test District',
}));
const transaction = mock(async () => {
  throw new Error('rejected requests must not write');
});
const send = mock(async () => {
  throw new Error('rejected requests must not deliver');
});
mock.module('~/utils/db.server', () => ({
  ...realDb,
  prisma: { freeTierApplication: { findFirst }, $transaction: transaction },
}));
mock.module('~/utils/auth.server', () => ({
  ...realAuth,
  requireUserId: async () => 'authorized-teacher',
}));
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  ...realGate,
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/domain/free-tier/email.server', () => ({
  ...realEmail,
  sendFreeTierAdminApprovalEmail: send,
}));
// Other onboarding test files replace this module; exercise the real service here.
mock.module('~/domain/free-tier/approval-flow.server', () => realFlow);
const { action } = await import('./route');
const oldEnvironment = process.env.YAWP_ENVIRONMENT;
const oldBudgetEnvironment = process.env.FREE_TIER_BUDGET_ENVIRONMENT;

beforeEach(() => {
  findFirst.mockClear();
  transaction.mockClear();
  send.mockClear();
  delete process.env.FREE_TIER_BUDGET_ENVIRONMENT;
});
afterAll(() => {
  if (oldEnvironment === undefined) delete process.env.YAWP_ENVIRONMENT;
  else process.env.YAWP_ENVIRONMENT = oldEnvironment;
  if (oldBudgetEnvironment === undefined)
    delete process.env.FREE_TIER_BUDGET_ENVIRONMENT;
  else process.env.FREE_TIER_BUDGET_ENVIRONMENT = oldBudgetEnvironment;
  mock.module('~/utils/db.server', () => realDb);
  mock.module('~/utils/auth.server', () => realAuth);
  mock.module(
    '~/utils/free-tier/free-tier-feature-gate.server',
    () => realGate
  );
  mock.module('~/domain/free-tier/email.server', () => realEmail);
  mock.restore();
});

for (const environment of ['demo', 'production']) {
  for (const adminEmail of [
    'Teacher+account@gmail.com',
    ' TEACHER+account@GMAIL.COM ',
    't.e.a.c.h.e.r+other@googlemail.com',
  ]) {
    test(`${environment}: direct POST rejects ${adminEmail} without writes or delivery`, async () => {
      process.env.YAWP_ENVIRONMENT = environment;
      const result = await action({
        request: new Request('http://localhost/app/free-tier/onboarding', {
          method: 'POST',
          body: new URLSearchParams({
            adminName: 'Teacher',
            adminEmail,
            adminRole: 'Principal',
            teacherEmail: 'spoofed@district.org',
            applicationId: 'someone-else',
          }),
        }),
      } as never);
      expect(result).toMatchObject({
        init: { status: 400 },
        data: {
          ok: false,
          reason: 'same_as_teacher',
          fieldErrors: {
            adminEmail: "Use your administrator's email here, not your own.",
          },
        },
      });
      expect(findFirst.mock.calls[1]).toEqual([
        {
          where: { id: 'self-admin-application', userId: 'authorized-teacher' },
          select: {
            id: true,
            status: true,
            email: true,
            name: true,
            schoolName: true,
          },
        },
      ]);
      expect(transaction).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });
  }
}
