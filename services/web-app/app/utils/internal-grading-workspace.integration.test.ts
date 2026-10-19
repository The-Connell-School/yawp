import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)(
  'signed grading workspace lifecycle uses real Postgres and a mocked provider',
  async () => {
    const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
    const url = new URL(connection);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.startsWith('/yawp_')
    )
      throw new Error('Requires an isolated local Yawp database');
    process.env.DATABASE_URL = connection;
    const { prisma } = await import('./db.server');
    const { signInternalApiRequest } =
      await import('./internal-platform-signing.server');
    const { recordInternalPlatformWriteAudit } =
      await import('./internal-platform-auth.server');
    const { createInternalGradingWorkspaceHandlers } =
      await import('./internal-grading-workspace.server');
    const keyId = `grading-${randomBytes(8).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');
    const saved = {
      keys: process.env.YAWP_INTERNAL_API_KEYS,
      nonce: process.env.INTERNAL_API_NONCE_STORE,
    };
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
      { id: keyId, secret, scopes: ['management:read', 'management:write'] },
    ]);
    delete process.env.INTERNAL_API_NONCE_STORE;
    let calls = 0;
    const handlers = createInternalGradingWorkspaceHandlers({
      db: prisma,
      auditRead: recordInternalPlatformWriteAudit,
      execute: async ({ purpose }) => {
        calls++;
        return JSON.stringify(
          purpose === 'criterion'
            ? { passed: true, evidence: 'Grounded in the sample' }
            : {
                categories: [
                  { key: 'claim', score: 3, comment: 'Clear claim' },
                ],
                overallComment: 'Jordan, explain the evidence.',
              }
        );
      },
    });
    const parent = await prisma.assignmentType.create({
      data: {
        title: 'Grading API lifecycle',
        position: 999,
        scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
        rubricJson: {
          categories: [
            {
              key: 'claim',
              label: 'Claim',
              weight: 1,
              description: 'Defensible claim',
            },
          ],
        },
        gradingPromptConfigJson: {
          systemInstructions: 'Evaluate carefully',
          gradingInstructions: 'Apply rubric',
        },
      },
    });
    const id = parent.id;
    const base = `https://yawp.test/api/internal/v1/admin/assignment-types/${id}`;
    const request = (
      method: string,
      path: string,
      value?: object,
      key?: string
    ) => {
      const body =
        method === 'GET'
          ? ''
          : JSON.stringify({ ...value, reason: '  Lifecycle review  ' });
      return new Request(base + path, {
        method,
        ...(method !== 'GET' ? { body } : {}),
        headers: {
          ...signInternalApiRequest({
            method,
            url: base + path,
            body,
            keyId,
            secret,
            actor: 'Operator@example.test',
          }).headers,
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
      });
    };
    const expectedOutput = {
      categories: [{ key: 'claim', score: 3, comment: 'Clear claim' }],
      overallComment: 'Jordan, explain the evidence.',
    };
    const sample = {
      name: 'Defensible claim',
      sample: 'An argument with evidence',
      expectedOutput,
    };
    try {
      const concurrent = await Promise.all(
        [1, 2].map(() =>
          handlers.handle(
            'promptVersions',
            request('POST', '/prompt-versions', {}, 'draft'),
            id
          )
        )
      );
      expect(concurrent.map((r) => r.status).sort()).toEqual([200, 201]);
      const created = concurrent.find((r) => r.status === 201)!;
      expect(created.status).toBe(201);
      const draft = (await created.json()).promptVersion;
      expect(
        (
          await handlers.handle(
            'promptVersions',
            request('POST', '/prompt-versions', {}, 'draft'),
            id
          )
        ).status
      ).toBe(200);
      expect(
        (
          await handlers.handle(
            'promptVersions',
            request(
              'POST',
              '/prompt-versions',
              { sourcePromptVersion: draft.id },
              'draft'
            ),
            id
          )
        ).status
      ).toBe(409);
      expect(
        (
          await handlers.handle(
            'promptVersion',
            request('PATCH', `/prompt-versions/${draft.id}`, {
              systemMessageTemplate: 'Evaluate {{system_instructions}}',
              userMessageTemplate:
                '{{document}} {{rubric}} {{grading_instructions}}',
            }),
            id,
            draft.id
          )
        ).status
      ).toBe(200);
      const suiteRes = await handlers.handle(
        'suites',
        request(
          'POST',
          '/evaluation-suites',
          { name: 'Claim suite', check: 'Identify the claim', cases: [sample] },
          'suite'
        ),
        id
      );
      expect(suiteRes.status).toBe(201);
      const suite = (await suiteRes.json()).suite;
      expect(
        (
          await handlers.handle(
            'suites',
            request(
              'POST',
              '/evaluation-suites',
              {
                name: 'Claim suite',
                check: 'Identify the claim',
                cases: [sample],
              },
              'suite'
            ),
            id
          )
        ).status
      ).toBe(200);
      const casesPath = `/evaluation-suites/${suite.id}/cases`;
      const caseBody = { ...sample, rubricCategoryKey: 'claim' };
      const stateBeforeInvalidCase = {
        cases: await prisma.assignmentTypeEvaluationCase.findMany({
          where: { assignmentTypeId: id },
          orderBy: { id: 'asc' },
        }),
        snapshots: await prisma.assignmentTypeEvaluationSuiteVersion.findMany({
          where: { assignmentTypeId: id },
          orderBy: { version: 'asc' },
        }),
        audits: await prisma.internalPlatformApiAudit.count({ where: { keyId } }),
      };
      for (const invalidOutput of [undefined, null]) {
        const invalidCase = await handlers.handle(
          'cases',
          request('POST', casesPath, {
            name: 'Missing expected output',
            sample: sample.sample,
            rubricCategoryKey: 'claim',
            expectedOutput: invalidOutput,
          }),
          id,
          suite.id
        );
        expect(invalidCase.status).toBe(400);
        expect(await invalidCase.json()).toEqual({
          error: 'Invalid grading workspace request',
        });
      }
      expect({
        cases: await prisma.assignmentTypeEvaluationCase.findMany({
          where: { assignmentTypeId: id },
          orderBy: { id: 'asc' },
        }),
        snapshots: await prisma.assignmentTypeEvaluationSuiteVersion.findMany({
          where: { assignmentTypeId: id },
          orderBy: { version: 'asc' },
        }),
        audits: await prisma.internalPlatformApiAudit.count({ where: { keyId } }),
      }).toEqual(stateBeforeInvalidCase);
      const caseRes = await handlers.handle(
        'cases',
        request('POST', casesPath, caseBody, 'case'),
        id,
        suite.id
      );
      expect(caseRes.status).toBe(201);
      const added = (await caseRes.json()).case;
      expect(
        (
          await handlers.handle(
            'cases',
            request('POST', casesPath, caseBody, 'case'),
            id,
            suite.id
          )
        ).status
      ).toBe(200);
      await prisma.assignmentTypeEvaluationCase.update({
        where: { id: suite.cases[0].id },
        data: { criterion: 'Preserve this separate check' },
      });
      expect(
        (
          await handlers.handle(
            'case',
            request('PATCH', `${casesPath}/${added.id}`, {
              name: 'Updated sample',
              check: 'Check only this sample',
            }),
            id,
            suite.id,
            added.id
          )
        ).status
      ).toBe(200);
      expect(
        (
          await prisma.assignmentTypeEvaluationCase.findUniqueOrThrow({
            where: { id: added.id },
          })
        ).criterion
      ).toBe('Check only this sample');
      expect(
        (
          await prisma.assignmentTypeEvaluationCase.findUniqueOrThrow({
            where: { id: suite.cases[0].id },
          })
        ).criterion
      ).toBe('Preserve this separate check');
      expect(
        (
          await handlers.handle(
            'case',
            request('DELETE', `${casesPath}/${added.id}`),
            id,
            'foreign-suite',
            added.id
          )
        ).status
      ).toBe(404);
      expect(
        (
          await handlers.handle(
            'case',
            request('DELETE', `${casesPath}/${added.id}`),
            id,
            suite.id,
            added.id
          )
        ).status
      ).toBe(200);
      expect(
        (
          await handlers.handle(
            'suite',
            request('PATCH', `/evaluation-suites/${suite.id}`, {
              name: 'Reviewed suite',
              check: 'Identify the claim',
              cases: [{ ...sample, id: suite.cases[0].id }],
            }),
            id,
            suite.id
          )
        ).status
      ).toBe(200);
      const scratch = await handlers.handle(
        'scratch',
        request('POST', '/scratch-check', {
          promptVersion: draft.id,
          sampleSubmission: 'An argument with evidence',
          check: 'Identify the claim',
        }),
        id
      );
      expect(scratch.status).toBe(200);
      expect((await scratch.json()).categoryScores[0].score).toBe(3);
      expect(calls).toBe(2);
      expect(
        await prisma.assignmentTypeEvaluationRun.count({
          where: { assignmentTypeId: id },
        })
      ).toBe(0);
      const publishBody = {
        acceptedRegressions: [],
        environment: 'production',
      };
      expect(
        (
          await handlers.handle(
            'publish',
            request(
              'POST',
              `/prompt-versions/${draft.id}/publish`,
              publishBody
            ),
            id,
            draft.id
          )
        ).status
      ).toBe(409);
      const latest =
        await prisma.assignmentTypeEvaluationSuiteVersion.findFirstOrThrow({
          where: { assignmentTypeId: id },
          orderBy: { version: 'desc' },
        });
      const current =
        await prisma.assignmentTypePromptVersion.findUniqueOrThrow({
          where: { id: draft.id },
        });
      // Existing synchronous admin execution owns run creation. Seed its completed
      // artifact here; the API deliberately does not invent an async job queue.
      const run = await prisma.assignmentTypeEvaluationRun.create({
        data: {
          assignmentTypeId: id,
          promptVersion: current.version,
          promptVersionId: current.id,
          promptRevision: current.revision,
          evaluationSuiteVersionId: latest.id,
          evaluationSuiteContentHash: latest.contentHash,
          promptSnapshotJson: {},
          status: 'completed',
          totalCases: 1,
          passedCases: 1,
          completedAt: new Date(),
        },
      });
      await prisma.assignmentTypeEvaluationResult.create({
        data: {
          runId: run.id,
          caseId: suite.cases[0].id,
          caseTitle: sample.name,
          rubricCategoryKey: 'claim',
          criterion: 'Identify the claim',
          status: 'pass',
          evidence: 'Grounded',
          gradingOutputJson: expectedOutput,
        },
      });
      const published = await handlers.handle(
        'publish',
        request('POST', `/prompt-versions/${draft.id}/publish`, publishBody),
        id,
        draft.id
      );
      expect(published.status).toBe(200);
      expect((await published.json()).promptVersion.status).toBe('production');
      const legacy = await prisma.assignmentType.findUniqueOrThrow({
        where: { id },
      });
      expect(legacy.gradingAssistantVersion).toBe(current.version);
      expect((legacy.gradingPromptConfigJson as any).userMessageTemplate).toBe(
        current.userMessageTemplate
      );
      expect(
        (await handlers.handle('runs', request('GET', '/evaluation-runs'), id))
          .status
      ).toBe(200);
      const detail = await handlers.handle(
        'run',
        request('GET', `/evaluation-runs/${run.id}`),
        id,
        run.id
      );
      expect((await detail.json()).run.results).toHaveLength(1);
      expect(
        (
          await handlers.handle(
            'run',
            request('GET', `/evaluation-runs/${run.id}`),
            'other',
            run.id
          )
        ).status
      ).toBe(404);
      const audits = await prisma.internalPlatformApiAudit.findMany({
        where: { keyId },
      });
      const writes = audits.filter(
        (a) => a.result === 'before' || a.result === 'after'
      );
      expect(writes.filter((a) => a.result === 'before')).toHaveLength(9);
      expect(writes.filter((a) => a.result === 'after')).toHaveLength(9);
      for (const row of writes) {
        expect(row.actorEmail).toBe('operator@example.test');
        expect((row.metadata as any).reason).toBe('Lifecycle review');
        expect(row.requestHash).toMatch(/^[0-9a-f]{64}$/);
      }
      const promotion = writes.find(
        (a) => a.action === 'grading-workspace.publish.post.before'
      )!;
      expect(
        (promotion.metadata as any).before.promptVersions.find(
          (v: any) => v.id === draft.id
        ).status
      ).toBe('draft');

      // Exercise the admin editor boundary using cases created through signed API calls.
      const boundaryResponse = await handlers.handle(
        'suites',
        request('POST', '/evaluation-suites', {
          name: 'Case limit',
          check: 'Identify the claim',
          cases: [sample],
        }),
        id
      );
      expect(boundaryResponse.status).toBe(201);
      const boundary = (await boundaryResponse.json()).suite;
      const casePath = `/evaluation-suites/${boundary.id}/cases`;
      for (let count = 1; count < 19; count++) {
        const added = await handlers.handle(
          'cases',
          request('POST', casePath, caseBody),
          id,
          boundary.id
        );
        expect(added.status).toBe(201);
      }
      const caseWhere = {
        assignmentTypeId: id,
        evaluationId: boundary.id,
        archivedAt: null,
      };
      expect(
        await prisma.assignmentTypeEvaluationCase.count({ where: caseWhere })
      ).toBe(19);
      const snapshots = () =>
        prisma.assignmentTypeEvaluationSuiteVersion.findMany({
          where: { assignmentTypeId: id },
          orderBy: { version: 'asc' },
        });
      const auditCount = () =>
        prisma.internalPlatformApiAudit.count({ where: { keyId } });
      const beforeBoundary = {
        snapshots: await snapshots(),
        audits: await auditCount(),
      };
      const attempts = await Promise.all(
        ['twentieth-a', 'twentieth-b'].map(async (key) => ({
          key,
          response: await handlers.handle(
            'cases',
            request('POST', casePath, caseBody, key),
            id,
            boundary.id
          ),
        }))
      );
      expect(attempts.map(({ response }) => response.status).sort()).toEqual([
        201, 409,
      ]);
      const winner = attempts.find(({ response }) => response.status === 201)!;
      const twentieth = (await winner.response.json()).case;
      expect(
        await attempts
          .find(({ response }) => response.status === 409)!
          .response.json()
      ).toEqual({
        error: 'Evaluation groups support at most 20 active cases.',
      });
      expect(
        await prisma.assignmentTypeEvaluationCase.count({ where: caseWhere })
      ).toBe(20);
      expect(await snapshots()).not.toEqual(beforeBoundary.snapshots);
      expect(await auditCount()).toBe(beforeBoundary.audits + 2);

      const fullState = {
        cases: await prisma.assignmentTypeEvaluationCase.findMany({
          where: caseWhere,
          orderBy: { id: 'asc' },
        }),
        snapshots: await snapshots(),
        audits: await auditCount(),
      };
      const rejected = await handlers.handle(
        'cases',
        request('POST', casePath, caseBody),
        id,
        boundary.id
      );
      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toEqual({
        error: 'Evaluation groups support at most 20 active cases.',
      });
      const replay = await handlers.handle(
        'cases',
        request('POST', casePath, caseBody, winner.key),
        id,
        boundary.id
      );
      expect(replay.status).toBe(200);
      expect((await replay.json()).case).toEqual(twentieth);
      expect({
        cases: await prisma.assignmentTypeEvaluationCase.findMany({
          where: caseWhere,
          orderBy: { id: 'asc' },
        }),
        snapshots: await snapshots(),
        audits: await auditCount(),
      }).toEqual(fullState);

      const { executeGradingWorkspaceAction } =
        await import('~/domain/ai-evaluation/grading-workspace-actions.server');
      const adminSave = await executeGradingWorkspaceAction(
        {
          intent: 'updateEvaluation',
          assignmentTypeId: id,
          evaluationId: boundary.id,
          title: 'Saved from the admin editor',
          description: boundary.description,
          casesJson: JSON.stringify(
            fullState.cases.map((c) => ({
              id: c.id,
              title: c.title,
              documentText: c.documentText,
              expectedOutput: c.expectedOutputJson,
            }))
          ),
        },
        new Request(
          'https://yawp.test/api/domain/assignment-type-evaluations',
          { method: 'POST' }
        ),
        prisma
      );
      expect(adminSave.data).toMatchObject({ success: true });
      expect(
        (
          await prisma.assignmentTypeEvaluation.findUniqueOrThrow({
            where: { id: boundary.id },
          })
        ).title
      ).toBe('Saved from the admin editor');
    } finally {
      await prisma.assignmentType.delete({ where: { id } });
      await prisma.internalPlatformApiAudit.deleteMany({ where: { keyId } });
      await prisma.internalApiRequestNonce.deleteMany({ where: { keyId } });
      if (saved.keys === undefined) delete process.env.YAWP_INTERNAL_API_KEYS;
      else process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
      if (saved.nonce === undefined)
        delete process.env.INTERNAL_API_NONCE_STORE;
      else process.env.INTERNAL_API_NONCE_STORE = saved.nonce;
    }
  },
  30000
);
