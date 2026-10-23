import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const enabled = process.env.APPROVAL_V2_DB_TESTS === '1';

describe.skipIf(!enabled)('admin token S9a on actions (real hash)', () => {
  let db: typeof import('~/utils/db.server').prisma;
  const ids: string[] = [];

  beforeEach(async () => {
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'local-s9a-action-test-secret';
    process.env.PRIMARY_APP_URL = 'http://localhost:5199';
    db = (await import('~/utils/db.server')).prisma;
  });

  afterEach(async () => {
    if (db && ids.length) {
      await db.freeTierSignedLink.deleteMany({
        where: { applicationId: { in: ids } },
      });
      await db.freeTierAdminApproval.deleteMany({
        where: { applicationId: { in: ids } },
      });
      await db.freeTierApplication.deleteMany({ where: { id: { in: ids } } });
      ids.length = 0;
    }
  });

  async function approvedApp() {
    const app = await db.freeTierApplication.create({
      data: {
        name: 'Secret Teacher',
        email: `s9a-${crypto.randomUUID()}@example.test`,
        schoolName: 'Secret School',
        location: 'Local',
        gradeLevel: '10',
        userId: 'approval-test-user',
        status: 'APPROVED',
      },
    });
    ids.push(app.id);
    return app;
  }

  function badOpaque(token: string) {
    const parts = token.split('.');
    return `${parts[0]}.${parts[1]}.not-the-real-opaque`;
  }

  test('denySchoolAdminApproval ignores bad opaque on approved application', async () => {
    const app = await approvedApp();
    const { mintSignedLink } = await import('./signed-link.server');
    const { denySchoolAdminApproval } = await import('./approval-deny.server');
    const { token } = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_APPROVE',
    });
    const result = await denySchoolAdminApproval({
      token: badOpaque(token),
      reason: 'policy',
      request: new Request('http://localhost/test'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('invalid');
    expect(result).not.toHaveProperty('teacherName');
    expect(result).not.toHaveProperty('schoolName');
  });

  test('redirectSchoolAdmin ignores bad opaque on approved application', async () => {
    const app = await approvedApp();
    const { mintSignedLink } = await import('./signed-link.server');
    const { redirectSchoolAdmin } = await import('./approval-flow.server');
    const { token } = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    const result = await redirectSchoolAdmin({
      token: badOpaque(token),
      newAdminName: 'New Admin',
      newAdminEmail: 'new-admin@example.test',
      request: new Request('http://localhost/test'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).not.toBe('already_approved');
    expect(result).not.toHaveProperty('teacherName');
  });

  test('forwardApprovalByToken ignores bad opaque on approved application', async () => {
    const app = await approvedApp();
    const { mintSignedLink } = await import('./signed-link.server');
    const { forwardApprovalByToken } = await import('./approval-v2.server');
    const { token } = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    const result = await forwardApprovalByToken({
      token: badOpaque(token),
      newAdminName: 'New Admin',
      newAdminEmail: 'new-admin@example.test',
      request: new Request('http://localhost/test'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result).not.toHaveProperty('teacherName');
    expect(result).not.toHaveProperty('schoolName');
  });
});
