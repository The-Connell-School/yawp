// FREE_TIER_DB_TESTS=1 DATABASE_URL=... bun test app/domain/free-tier/approval-flow.integration.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { setApprovalHooks } from './approval-hooks.server';
import { completeSchoolAdminApproval, submitAdminDetails } from './approval-flow.server';

const enabled = process.env.FREE_TIER_DB_TESTS === '1';

describe('free-tier approval flow', () => {
  if (!enabled) {
    test.skip('requires FREE_TIER_DB_TESTS', () => {});
    return;
  }

  const secret = process.env.FREE_TIER_LINK_HMAC_SECRET;
  beforeEach(() => {
    process.env.FREE_TIER_LINK_HMAC_SECRET =
      secret || 'integration-test-free-tier-link-secret-key';
  });
  afterEach(() => {
    if (secret === undefined) delete process.env.FREE_TIER_LINK_HMAC_SECRET;
    else process.env.FREE_TIER_LINK_HMAC_SECRET = secret;
    setApprovalHooks({});
  });

  test('account → admin submit → approve calls hook once (idempotent second click)', async () => {
    let hookCalls = 0;
    setApprovalHooks({
      onApplicationApproved: async () => {
        hookCalls += 1;
      },
    });
    const email = `ft-flow-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Flow Teacher',
        schoolName: 'Flow HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Flow Teacher' },
            select: { id: true },
          })
        ).id,
      },
    });
    const submit = await submitAdminDetails({
      applicationId: app.id,
      userId: app.userId!,
      adminName: 'Principal Pat',
      adminEmail: 'principal@school.edu',
      adminRole: 'Principal',
      requestBaseUrl: 'https://yawp.test',
    });
    expect(submit.ok).toBe(true);
    if (!submit.ok || !('approveToken' in submit)) throw new Error('missing approve token');
    const approveToken = submit.approveToken;
    const req = new Request('https://yawp.test/free/admin/approve', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.1' },
    });
    const first = await completeSchoolAdminApproval({
      token: approveToken,
      adminRole: 'Principal',
      authorized: true,
      request: req,
      requestBaseUrl: 'https://yawp.test',
    });
    expect(first.ok).toBe(true);
    const second = await completeSchoolAdminApproval({
      token: approveToken,
      adminRole: 'Principal',
      authorized: true,
      request: req,
      requestBaseUrl: 'https://yawp.test',
    });
    expect(second.ok).toBe(true);
    expect('idempotent' in second && second.idempotent).toBe(true);
    expect(hookCalls).toBe(1);
    const finalApp = await prisma.freeTierApplication.findUnique({ where: { id: app.id } });
    expect(finalApp?.status).toBe('APPROVED');
  });
});
