import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const enabled = process.env.APPROVAL_V2_DB_TESTS === '1';

describe.skipIf(!enabled)('applicationIdIfOpaqueHashVerified (real hash)', () => {
  let db: typeof import('~/utils/db.server').prisma;
  const ids: string[] = [];

  beforeEach(async () => {
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'local-opaque-hash-test-secret';
    db = (await import('~/utils/db.server')).prisma;
  });

  afterEach(async () => {
    if (db && ids.length) {
      await db.freeTierSignedLink.deleteMany({
        where: { applicationId: { in: ids } },
      });
      await db.freeTierApplication.deleteMany({ where: { id: { in: ids } } });
      ids.length = 0;
    }
  });

  async function mint(appId: string) {
    const { mintSignedLink } = await import('./signed-link.server');
    return mintSignedLink({
      applicationId: appId,
      purpose: 'ADMIN_APPROVE',
    });
  }

  test('valid token resolves application id', async () => {
    const app = await db.freeTierApplication.create({
      data: {
        name: 'T',
        email: `opaque-${crypto.randomUUID()}@example.test`,
        schoolName: 'S',
        location: 'L',
        gradeLevel: '9',
        status: 'SENT',
      },
    });
    ids.push(app.id);
    const { token } = await mint(app.id);
    const { applicationIdIfOpaqueHashVerified } = await import(
      './signed-link.server'
    );
    expect(
      await applicationIdIfOpaqueHashVerified({
        token,
        expectedPurpose: 'ADMIN_APPROVE',
      })
    ).toBe(app.id);
  });

  test('bad opaque returns null', async () => {
    const app = await db.freeTierApplication.create({
      data: {
        name: 'T',
        email: `opaque-${crypto.randomUUID()}@example.test`,
        schoolName: 'S',
        location: 'L',
        gradeLevel: '9',
        status: 'SENT',
      },
    });
    ids.push(app.id);
    const { token } = await mint(app.id);
    const parts = token.split('.');
    const bad = `${parts[0]}.${parts[1]}.bad-opaque-token`;
    const { applicationIdIfOpaqueHashVerified } = await import(
      './signed-link.server'
    );
    expect(
      await applicationIdIfOpaqueHashVerified({
        token: bad,
        expectedPurpose: 'ADMIN_APPROVE',
      })
    ).toBeNull();
  });

  test('expired link with bad opaque returns null', async () => {
    const app = await db.freeTierApplication.create({
      data: {
        name: 'T',
        email: `opaque-${crypto.randomUUID()}@example.test`,
        schoolName: 'S',
        location: 'L',
        gradeLevel: '9',
        status: 'SENT',
      },
    });
    ids.push(app.id);
    const { token, linkId } = await mint(app.id);
    await db.freeTierSignedLink.update({
      where: { id: linkId },
      data: { expiresAt: new Date(0) },
    });
    const parts = token.split('.');
    const bad = `${parts[0]}.${parts[1]}.bad-opaque-token`;
    const { applicationIdIfOpaqueHashVerified } = await import(
      './signed-link.server'
    );
    expect(
      await applicationIdIfOpaqueHashVerified({
        token: bad,
        expectedPurpose: 'ADMIN_APPROVE',
      })
    ).toBeNull();
  });

  test('expired link with valid opaque still resolves for naming', async () => {
    const app = await db.freeTierApplication.create({
      data: {
        name: 'T',
        email: `opaque-${crypto.randomUUID()}@example.test`,
        schoolName: 'S',
        location: 'L',
        gradeLevel: '9',
        status: 'SENT',
      },
    });
    ids.push(app.id);
    const { token, linkId } = await mint(app.id);
    await db.freeTierSignedLink.update({
      where: { id: linkId },
      data: { expiresAt: new Date(0) },
    });
    const { applicationIdIfOpaqueHashVerified } = await import(
      './signed-link.server'
    );
    expect(
      await applicationIdIfOpaqueHashVerified({
        token,
        expectedPurpose: 'ADMIN_APPROVE',
      })
    ).toBe(app.id);
  });
});
