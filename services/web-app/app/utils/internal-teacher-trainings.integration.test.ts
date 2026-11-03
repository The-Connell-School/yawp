import { expect, mock, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
const sendEmail = mock(async () => {
  throw new Error('Training integration must not send email');
});
mock.module('~/utils/email.server', () => ({ sendEmail }));

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)(
  'signed teacher training lifecycle, concurrent replay and ownership use real Postgres',
  async () => {
    const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
    const database = new URL(connection);
    if (
      !['localhost', '127.0.0.1'].includes(database.hostname) ||
      !database.pathname.startsWith('/yawp_')
    )
      throw new Error('Requires an isolated local Yawp database');
    process.env.DATABASE_URL = connection;
    const { prisma } = await import('./db.server');
    const { signInternalApiRequest } =
      await import('./internal-platform-signing.server');
    const { createInternalTeacherTrainingHandlers } =
      await import('./internal-teacher-trainings.server');
    const keyId = `training-${randomBytes(8).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');
    const saved = {
      keys: process.env.YAWP_INTERNAL_API_KEYS,
      nonce: process.env.INTERNAL_API_NONCE_STORE,
    };
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
      { id: keyId, secret, scopes: ['management:read', 'management:write'] },
    ]);
    delete process.env.INTERNAL_API_NONCE_STORE;
    const media = {
      async createUpload(input: any) {
        return {
          ...input,
          key: `teacher-trainings/${input.trainingId}/modules/${input.moduleId}/${randomUUID()}`,
          uploadId: randomUUID(),
          partSize: 16 * 1024 * 1024,
          partCount: 1,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
      },
      async signUpload(upload: any) {
        return {
          ...upload,
          expiresIn: 3600,
          parts: [{ partNumber: 1, url: 'https://s3.example.test/test-only' }],
        };
      },
      async completeUpload(upload: any) {
        return upload.kind === 'resource' ? Buffer.from('%PDF-1.7') : undefined;
      },
    };
    // Enforce that all API ORM reads and mutation return values contain metadata only.
    // Seed/check queries below deliberately use the unwrapped client.
    const assertNoBytes = (value: unknown): void => {
      expect(value instanceof Uint8Array).toBe(false);
      if (value && typeof value === 'object')
        for (const child of Object.values(value)) assertNoBytes(child);
    };
    const metadataDb = prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const result = await query(args);
            assertNoBytes(result);
            return result;
          },
        },
      },
    });
    const handlers = createInternalTeacherTrainingHandlers({
      db: metadataDb as unknown as typeof prisma,
      media,
      auditRead: async (data) => {
        await prisma.internalPlatformApiAudit.create({ data });
      },
    });
    const base = '/api/internal/v1/admin/teacher-trainings';
    let id: string | undefined;
    const request = (
      method: string,
      path: string,
      value?: unknown,
      retry?: string
    ) => {
      const url = `https://yawp.test${base}${path}`;
      const body = value === undefined ? '' : JSON.stringify(value);
      const headers = new Headers(
        signInternalApiRequest({
          method,
          url,
          body,
          keyId,
          secret,
          actor: 'Operator@example.test',
        }).headers
      );
      if (retry) headers.set('Idempotency-Key', retry);
      return new Request(url, {
        method,
        headers,
        ...(method === 'GET' ? {} : { body }),
      });
    };
    async function call(
      op: string,
      method: string,
      path: string,
      value?: unknown,
      moduleId?: string,
      resourceId?: string,
      retry = randomUUID()
    ) {
      return handlers.handle(op as never, request(method, path, value, retry), {
        id,
        moduleId,
        resourceId,
      });
    }
    try {
      const create = () =>
        handlers.handle(
          'create',
          request(
            'POST',
            '',
            { title: 'Integration training', reason: '  Create training  ' },
            'concurrent-create'
          )
        );
      const created = await Promise.all([create(), create()]);
      expect(created.map((r) => r.status).sort()).toEqual([200, 201]);
      const initial = (await created[0].json()).teacherTraining;
      id = initial.id;
      expect((await created[1].json()).teacherTraining.id).toBe(id);
      expect(
        (
          await handlers.handle(
            'create',
            request('POST', '', { title: 'Changed bytes' }, 'concurrent-create')
          )
        ).status
      ).toBe(409);
      const path = `/${id}`;
      expect(
        (
          await call('update', 'PATCH', path, {
            description: 'Updated',
            reason: 'Edit training',
          })
        ).status
      ).toBe(200);
      const modules = await Promise.all(
        ['First', 'Second'].map((title) =>
          call('createModule', 'POST', `${path}/modules`, {
            title,
            videoDuration: 42,
            reason: 'Create module',
          })
        )
      );
      expect(modules.map((r) => r.status)).toEqual([201, 201]);
      const row = await prisma.teacherTraining.findUniqueOrThrow({
        where: { id },
        include: { teacherTrainingModules: { orderBy: { position: 'asc' } } },
      });
      const [first, second] = row.teacherTrainingModules;
      expect([first.position, second.position]).toEqual([0, 1]);
      expect(
        (
          await call(
            'updateModule',
            'PATCH',
            `${path}/modules/${first.id}`,
            { title: 'Edited module', reason: 'Edit module' },
            first.id
          )
        ).status
      ).toBe(200);
      expect(
        (
          await call(
            'updateModule',
            'PATCH',
            `${path}/modules/foreign`,
            { title: 'Invalid' },
            'foreign'
          )
        ).status
      ).toBe(404);
      expect(
        (
          await call('reorderModules', 'PUT', `${path}/modules/order`, {
            moduleIds: [second.id, first.id],
            reason: 'Reorder modules',
          })
        ).status
      ).toBe(200);
      const png = Buffer.from('89504e470d0a1a0a', 'hex');
      expect(
        (
          await call('replaceImage', 'PUT', `${path}/image`, {
            contentType: 'image/png',
            dataBase64: png.toString('base64'),
            reason: 'Replace image',
          })
        ).status
      ).toBe(200);
      expect(
        (
          await call('removeImage', 'DELETE', `${path}/image`, {
            reason: 'Remove image',
          })
        ).status
      ).toBe(200);
      for (const kind of ['Video', 'Resource']) {
        const route = kind === 'Video' ? 'video' : 'resources';
        const input =
          kind === 'Video'
            ? { name: 'intro.mp4', contentType: 'video/mp4', size: 123 }
            : { name: 'guide.pdf', contentType: 'application/pdf', size: 8 };
        const started = await call(
          `start${kind}`,
          'POST',
          `${path}/modules/${first.id}/${route}/upload-url`,
          { ...input, reason: 'Start upload' },
          first.id
        );
        expect(started.status).toBe(201);
        const upload = (await started.json()).upload;
        const body = {
          uploadId: upload.uploadId,
          parts: [{ partNumber: 1, etag: 'etag' }],
          reason: 'Complete upload',
        };
        const retry = randomUUID();
        const completed = await call(
          `complete${kind}`,
          'POST',
          `${path}/modules/${first.id}/${route}/complete`,
          body,
          first.id,
          undefined,
          retry
        );
        expect(completed.status).toBe(201);
        expect(
          (
            await call(
              `complete${kind}`,
              'POST',
              `${path}/modules/${first.id}/${route}/complete`,
              body,
              first.id,
              undefined,
              retry
            )
          ).status
        ).toBe(200);
        if (kind === 'Video') {
          expect(
            (
              await call(
                'deleteVideo',
                'DELETE',
                `${path}/modules/${first.id}/video`,
                { reason: 'Remove video' },
                first.id
              )
            ).status
          ).toBe(200);
        } else {
          const resourceId = (
            await completed.json()
          ).teacherTraining.modules.find((m: any) => m.id === first.id)
            .resources[0].id;
          expect(
            (
              await call(
                'deleteResource',
                'DELETE',
                `${path}/modules/${second.id}/resources/${resourceId}`,
                {},
                second.id,
                resourceId
              )
            ).status
          ).toBe(404);
          expect(
            (
              await call(
                'deleteResource',
                'DELETE',
                `${path}/modules/${first.id}/resources/${resourceId}`,
                { reason: 'Remove resource' },
                first.id,
                resourceId
              )
            ).status
          ).toBe(200);
        }
      }
      // Generate legacy-sized bytes inside Postgres; the API must only receive lengths.
      const legacySize = 25 * 1024 * 1024;
      const legacyIds = [randomUUID(), randomUUID(), randomUUID()];
      for (let i = 0; i < legacyIds.length; i++) {
        await prisma.$executeRaw`
          INSERT INTO "TeacherTrainingModuleResource"
            (id, name, "contentType", blob, "teacherTrainingModuleId")
          VALUES (${legacyIds[i]}, 'Legacy large PDF', 'application/pdf',
            decode(repeat('ab', ${legacySize}), 'hex'), ${i === 0 ? first.id : second.id})`;
      }
      await prisma.$executeRaw`
        INSERT INTO "TeacherTrainingImage" (id, "contentType", blob, "teacherTrainingId")
        VALUES (${randomUUID()}, 'image/png', decode(repeat('cd', ${6 * 1024 * 1024}), 'hex'), ${id})`;
      const detail = await call('detail', 'GET', path);
      expect(detail.status).toBe(200);
      const metadata = (await detail.json()).teacherTraining;
      expect(metadata.modules.map((m: any) => m.id)).toEqual([
        second.id, first.id,
      ]);
      const resourceLengths = (training: any) =>
        training.modules.flatMap((m: any) => m.resources)
          .map((r: any) => r.byteLength);
      expect(resourceLengths(metadata)).toEqual([
        legacySize, legacySize, legacySize,
      ]);
      const patched = await call('update', 'PATCH', path, {
        title: 'Small metadata edit',
        reason: 'Edit title with legacy resources',
      });
      expect(patched.status).toBe(200);
      expect(resourceLengths((await patched.json()).teacherTraining)).toEqual([
        legacySize, legacySize, legacySize,
      ]);
      const titleAudits = await prisma.internalPlatformApiAudit.findMany({
        where: { keyId, action: { startsWith: 'teacher-training.update.' } },
        orderBy: { createdAt: 'desc' },
        take: 2,
      });
      expect(titleAudits.map((a) => a.result).sort()).toEqual(['after', 'before']);
      for (const audit of titleAudits) {
        const snapshot = (audit.metadata as any)[audit.result].teacherTraining;
        expect(snapshot.image.size).toBe(6 * 1024 * 1024);
        expect(snapshot.image.sha256).toBeUndefined();
        expect(resourceLengths(snapshot)).toEqual([
          legacySize, legacySize, legacySize,
        ]);
        expect(JSON.stringify(snapshot)).not.toContain('sha256');
        expect(audit.requestHash).toMatch(/^[a-f0-9]{64}$/);
      }
      expect(
        (await call(
          'deleteResource', 'DELETE',
          `${path}/modules/${second.id}/resources/${legacyIds[1]}`,
          { reason: 'Remove large legacy resource' },
          second.id, legacyIds[1]
        )).status
      ).toBe(200);
      expect((await call('list', 'GET', '')).status).toBe(200);
      expect(
        (
          await call(
            'deleteModule',
            'DELETE',
            `${path}/modules/${first.id}`,
            { reason: 'Remove module' },
            first.id
          )
        ).status
      ).toBe(200);
      expect(
        await prisma.teacherTrainingModule.findUnique({
          where: { id: first.id },
        })
      ).toBeNull();
      // A failed audit must roll back the authored data in the same transaction.
      const faulty = createInternalTeacherTrainingHandlers({
        db: {
          teacherTraining: prisma.teacherTraining,
          $transaction: (fn: any, options: any) =>
            prisma.$transaction(
              (tx) =>
                fn({
                  ...tx,
                  internalPlatformApiAudit: {
                    ...tx.internalPlatformApiAudit,
                    createMany: async () => {
                      throw new Error('audit unavailable');
                    },
                  },
                }),
              options
            ),
        } as never,
      });
      expect(
        (
          await faulty.handle(
            'update',
            request('PATCH', path, { title: 'Must roll back' }),
            { id }
          )
        ).status
      ).toBe(502);
      expect(
        (await prisma.teacherTraining.findUniqueOrThrow({ where: { id } }))
          .title
      ).toBe('Small metadata edit');
      expect(
        (await call('delete', 'DELETE', path, { reason: 'Remove training' }))
          .status
      ).toBe(200);
      expect(
        await prisma.teacherTraining.findUnique({ where: { id } })
      ).toBeNull();
      expect(
        await prisma.teacherTrainingModule.count({
          where: { teacherTrainingId: id },
        })
      ).toBe(0);
      const audits = await prisma.internalPlatformApiAudit.findMany({
        where: { keyId },
      });
      const before = audits.filter((a) => a.result === 'before');
      const after = audits.filter((a) => a.result === 'after');
      expect(before.length).toBeGreaterThan(12);
      expect(before).toHaveLength(after.length);
      for (const audit of [...before, ...after]) {
        expect(audit.actorEmail).toBe('operator@example.test');
        expect((audit.metadata as any).reason).toBeTruthy();
      }
      expect(
        (
          after.find((a) => a.action === 'teacher-training.create.after')!
            .metadata as any
        ).reason
      ).toBe('Create training');
      expect(audits.filter((a) => a.result.endsWith('.success'))).toHaveLength(
        2
      );
      expect(JSON.stringify(audits)).not.toContain('"blob"');
      expect(JSON.stringify(audits)).not.toContain('https://s3.');
      expect(sendEmail).not.toHaveBeenCalled();
    } finally {
      if (id) await prisma.teacherTraining.deleteMany({ where: { id } });
      await prisma.internalPlatformApiAudit.deleteMany({ where: { keyId } });
      await prisma.internalApiRequestNonce.deleteMany({ where: { keyId } });
      if (saved.keys === undefined) delete process.env.YAWP_INTERNAL_API_KEYS;
      else process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
      if (saved.nonce === undefined)
        delete process.env.INTERNAL_API_NONCE_STORE;
      else process.env.INTERNAL_API_NONCE_STORE = saved.nonce;
      await prisma.$disconnect();
    }
  },
  30000
);
