import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)(
  'signed assignment type lifecycle commits changes and audits in a real database',
  async () => {
    const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
    const database = new URL(connection);
    if (
      !['localhost', '127.0.0.1'].includes(database.hostname) ||
      !database.pathname.startsWith('/yawp_')
    ) {
      throw new Error(
        'Assignment type integration requires an isolated local Yawp database'
      );
    }
    process.env.DATABASE_URL = connection;
    const { prisma } = await import('./db.server');
    const { signInternalApiRequest } =
      await import('./internal-platform-signing.server');
    const { createInternalAssignmentTypeWriteHandlers } =
      await import('./internal-assignment-type-writes.server');
    const handlers = createInternalAssignmentTypeWriteHandlers({ db: prisma });
    const keyId = `assignment-write-${randomBytes(8).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');
    const saved = {
      keys: process.env.YAWP_INTERNAL_API_KEYS,
      nonceStore: process.env.INTERNAL_API_NONCE_STORE,
    };
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
      { id: keyId, secret, scopes: ['management:write'] },
    ]);
    delete process.env.INTERNAL_API_NONCE_STORE;
    let id: string | undefined;
    function request(method: string, path: string, value?: unknown) {
      const url = `https://yawp.test/api/internal/v1/admin/assignment-types${path}`;
      const body = value === undefined ? '' : JSON.stringify(value);
      return new Request(url, {
        method,
        body,
        headers: signInternalApiRequest({
          method,
          url,
          body,
          keyId,
          secret,
          actor: 'Operator@example.test',
        }).headers,
      });
    }
    try {
      const created = await handlers.create(
        request('POST', '', {
          title: 'Lifecycle integration',
          gradingInstructionsOverride: 'Initial',
          allowsImageUploads: true,
        })
      );
      expect(created.status).toBe(201);
      const initial = (await created.json()).assignmentType;
      id = initial.id;
      const edited = await handlers.update(
        request('PATCH', `/${id}`, {
          title: 'Edited integration',
          gradingInstructionsOverride: 'Revised',
          collaborationSupported: true,
        }),
        id
      );
      expect(edited.status).toBe(200);
      expect((await edited.json()).assignmentType).toMatchObject({
        title: 'Edited integration',
        allowsImageUploads: true,
        collaborationSupported: true,
        gradingAssistantVersion: initial.gradingAssistantVersion + 1,
      });
      const archived = await handlers.archive(
        request('POST', `/${id}/archive`),
        id
      );
      expect(archived.status).toBe(200);
      expect((await archived.json()).assignmentType.archivedAt).toBeTruthy();
      const restored = await handlers.restore(
        request('POST', `/${id}/restore`),
        id
      );
      expect(restored.status).toBe(200);
      expect((await restored.json()).assignmentType.archivedAt).toBeNull();
      const audits = await prisma.internalPlatformApiAudit.findMany({
        where: { keyId },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits).toHaveLength(8);
      expect(
        audits.every(
          (a) => a.actorEmail === 'operator@example.test' && a.targetId === id
        )
      ).toBe(true);
      expect(audits.filter((a) => a.result === 'before')).toHaveLength(4);
      expect(audits.filter((a) => a.result === 'after')).toHaveLength(4);
    } finally {
      if (id) await prisma.assignmentType.delete({ where: { id } });
      await prisma.internalPlatformApiAudit.deleteMany({ where: { keyId } });
      await prisma.internalApiRequestNonce.deleteMany({ where: { keyId } });
      if (saved.keys === undefined) delete process.env.YAWP_INTERNAL_API_KEYS;
      else process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
      if (saved.nonceStore === undefined)
        delete process.env.INTERNAL_API_NONCE_STORE;
      else process.env.INTERNAL_API_NONCE_STORE = saved.nonceStore;
      await prisma.$disconnect();
    }
  },
  30000
);
