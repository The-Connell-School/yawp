import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)(
  'signed module and step lifecycle uses real Postgres locks, writes and audits',
  async () => {
    const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
    const database = new URL(connection);
    if (
      !['localhost', '127.0.0.1'].includes(database.hostname) ||
      !database.pathname.startsWith('/yawp_')
    )
      throw new Error(
        'Module integration requires an isolated local Yawp database'
      );
    process.env.DATABASE_URL = connection;
    const { prisma } = await import('./db.server');
    const { signInternalApiRequest } =
      await import('./internal-platform-signing.server');
    const { createInternalAssignmentTypeModuleHandlers } =
      await import('./internal-assignment-type-module-writes.server');
    const handlers = createInternalAssignmentTypeModuleHandlers({ db: prisma });
    const keyId = `module-write-${randomBytes(8).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');
    const saved = {
      keys: process.env.YAWP_INTERNAL_API_KEYS,
      nonceStore: process.env.INTERNAL_API_NONCE_STORE,
    };
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
      { id: keyId, secret, scopes: ['management:write', 'management:read'] },
    ]);
    delete process.env.INTERNAL_API_NONCE_STORE;
    const type = await prisma.assignmentType.create({
      data: { title: 'Module lifecycle', position: 999 },
    });
    const id = type.id;
    function request(
      method: string,
      path: string,
      value?: unknown,
      idempotency?: string
    ) {
      const url = `https://yawp.test/api/internal/v1/admin/assignment-types/${id}/modules${path}`;
      const body =
        method === 'GET'
          ? ''
          : JSON.stringify({
              ...(value as object),
              reason: '  Lifecycle review  ',
            });
      return new Request(url, {
        method,
        ...(method !== 'GET' ? { body } : {}),
        headers: {
          ...signInternalApiRequest({
            method,
            url,
            body,
            keyId,
            secret,
            actor: 'Operator@example.test',
          }).headers,
          ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
        },
      });
    }
    try {
      const created = await handlers.createModule(
        request(
          'POST',
          '',
          {
            title: 'First module',
            tutorInstructionsVariantsJson: { dbq: 'Guide' },
            rubricAlignmentJson: { thesis: 'primary' },
          },
          'module-create'
        ),
        id
      );
      expect(created.status).toBe(201);
      const module = (await created.json()).module;
      const mid = module.id;
      expect(
        (
          await handlers.createModule(
            request(
              'POST',
              '',
              {
                title: 'First module',
                tutorInstructionsVariantsJson: { dbq: 'Guide' },
                rubricAlignmentJson: { thesis: 'primary' },
              },
              'module-create'
            ),
            id
          )
        ).status
      ).toBe(200);
      const secondModule = await handlers.createModule(
        request('POST', '', { title: 'Second module' }),
        id
      );
      const secondMid = (await secondModule.json()).module.id;
      const stepIds: string[] = [];
      for (const title of ['First step', 'Second step']) {
        const res = await handlers.createStep(
          request('POST', `/${mid}/steps`, {
            title,
            prompt: 'Write',
            answerKey: 'Original key',
            nextButtonLabel: '  Continue  ',
            buttons: [{ label: 'Go', action: 'advance' }],
          }),
          id,
          mid
        );
        expect(res.status).toBe(201);
        const current = (await res.json()).module;
        expect(current.instructions.at(-1)).toMatchObject({
          answerKey: 'Original key',
          nextButtonLabel: 'Continue',
        });
        stepIds.push(current.instructions.at(-1).id);
      }
      const order = await handlers.reorderSteps(
        request('PUT', `/${mid}/steps/order`, {
          stepIds: [...stepIds].reverse(),
        }),
        id,
        mid
      );
      expect((await order.json()).steps.map((s: any) => s.id)).toEqual(
        [...stepIds].reverse()
      );
      const patch = await handlers.updateStep(
        request('PATCH', `/${mid}/steps/${stepIds[0]}`, {
          prompt: 'Revised prompt',
          answerKey: 'Revised key',
          nextButtonLabel: null,
          tutorInstructionsVariantsJson: { leq: 'Guide' },
          buttons: [{ label: 'Respond', action: 'response' }],
        }),
        id,
        mid,
        stepIds[0]
      );
      expect(patch.status).toBe(200);
      expect(
        (await patch.json()).module.instructions.find(
          (s: any) => s.id === stepIds[0]
        )
      ).toMatchObject({
        title: 'First step',
        prompt: 'Revised prompt',
        tutorInstructionsVariantsJson: { leq: 'Guide' },
        buttons: [{ label: 'Respond', action: 'response', position: 0 }],
      });
      const persistedStep =
        await prisma.assignmentModuleInstruction.findUniqueOrThrow({
          where: { id: stepIds[0] },
        });
      expect(persistedStep).toMatchObject({
        answerKey: 'Revised key',
        nextButtonLabel: null,
      });
      const studentModule = await prisma.assignmentModule.findUniqueOrThrow({
        where: { id: mid },
        include: {
          instructions: {
            omit: { answerKey: true },
            include: { buttons: true },
          },
        },
      });
      expect(studentModule.instructions).toHaveLength(2);
      expect(JSON.stringify(studentModule)).not.toContain('answerKey');
      expect(JSON.stringify(studentModule)).not.toContain('Revised key');
      const read = await handlers.detail(request('GET', `/${mid}`), id, mid);
      expect(
        (await read.json()).module.instructions.find(
          (s: any) => s.id === stepIds[0]
        )
      ).toMatchObject({ answerKey: 'Revised key', nextButtonLabel: null });
      expect(
        (
          await handlers.deleteStep(
            request('DELETE', `/${mid}/steps/${stepIds[1]}`),
            id,
            mid,
            stepIds[1]
          )
        ).status
      ).toBe(200);
      expect(
        await prisma.assignmentModuleInstruction.findUnique({
          where: { id: stepIds[1] },
        })
      ).toBeNull();
      const reorder = await handlers.reorderModules(
        request('PUT', '/order', { moduleIds: [secondMid, mid] }),
        id
      );
      expect((await reorder.json()).modules.map((m: any) => m.id)).toEqual([
        secondMid,
        mid,
      ]);
      expect(
        (await handlers.deleteModule(request('DELETE', `/${mid}`), id, mid))
          .status
      ).toBe(200);
      expect(
        (
          await prisma.assignmentModule.findUniqueOrThrow({
            where: { id: mid },
          })
        ).deletedAt
      ).not.toBeNull();
      expect(
        await prisma.assignmentModuleInstruction.count({
          where: { assignmentModuleId: mid },
        })
      ).toBe(1);
      expect(
        (await handlers.detail(request('GET', `/${mid}`), id, mid)).status
      ).toBe(404);
      const audits = await prisma.internalPlatformApiAudit.findMany({
        where: { keyId },
      });
      expect(audits).toHaveLength(18);
      expect(
        audits.every(
          (a) =>
            a.actorEmail === 'operator@example.test' &&
            a.keyId === keyId &&
            (a.metadata as any).reason === 'Lifecycle review'
        )
      ).toBe(true);
      expect(audits.filter((a) => a.result === 'before')).toHaveLength(9);
      const patchBefore = audits.find(
        (a) => a.action === 'assignment-type.step.update.before'
      )!;
      const patchAfter = audits.find(
        (a) => a.action === 'assignment-type.step.update.after'
      )!;
      expect(JSON.stringify(patchBefore.metadata)).toContain('Write');
      expect(JSON.stringify(patchAfter.metadata)).toContain('Revised prompt');
      expect(JSON.stringify(patchBefore.metadata)).toContain('Original key');
      expect(JSON.stringify(patchAfter.metadata)).toContain('Revised key');
    } finally {
      await prisma.assignmentType.delete({ where: { id } });
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
