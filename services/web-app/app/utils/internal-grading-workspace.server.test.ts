import { beforeEach, afterEach, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
const prisma: any = {};
mock.module('~/utils/db.server', () => ({ prisma }));
const completion = mock(async (_input: any): Promise<string> => {
  throw new Error('Provider must be explicitly mocked');
});
mock.module('~/utils/getLLMCompletion', () => ({
  getLLMCompletion: completion,
}));
const { createInternalGradingWorkspaceHandlers } =
  await import('./internal-grading-workspace.server');
const {
  signInternalApiRequest,
  resetInternalApiMemoryNonceStore,
  resetInternalApiRateLimitBuckets,
} = await import('./internal-platform-auth.server');
const secret = 'grading-test-secret-at-least-32-characters';
const saved = { ...process.env };
const base = 'https://yawp.test/api/internal/v1/admin/assignment-types/at-1';
function req(method: string, path: string, value?: unknown, opts: any = {}) {
  const body = opts.raw ?? (value === undefined ? '' : JSON.stringify(value));
  const url = base + path;
  return new Request(url, {
    method,
    headers: {
      ...(opts.unsigned
        ? {}
        : signInternalApiRequest({
            method,
            url,
            body,
            keyId: opts.keyId ?? 'writer',
            secret,
            actor: 'Operator@example.test',
          }).headers),
      ...(opts.key ? { 'Idempotency-Key': opts.key } : {}),
    },
    ...(method !== 'GET' ? { body } : {}),
  });
}
function fixture() {
  const versions: any[] = [
    {
      id: 'pv-1',
      assignmentTypeId: 'at-1',
      version: 1,
      revision: 1,
      status: 'production',
      systemMessageTemplate: 'Evaluate {{rubric}}',
      userMessageTemplate: '{{document}} {{rubric}}',
      contentHash: 'original',
    },
  ];
  const audits: any[] = [];
  const events: string[] = [];
  const parent: any = {
    id: 'at-1',
    title: 'Essay',
    kind: null,
    systemKey: null,
    gradingAssistantVersion: 1,
    scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
    rubricJson: {
      categories: [
        { key: 'claim', label: 'Claim', weight: 1, description: 'Claim' },
      ],
    },
    gradingPromptConfigJson: {
      systemInstructions: 'Evaluate',
      gradingInstructions: 'Apply rubric',
    },
    evaluations: [],
    evaluationCases: [],
  };
  const matches = (r: any, w: any) =>
    Object.entries(w).every(([k, v]) => r[k] === v);
  const db: any = {
    $queryRaw: mock(async () => {
      events.push('lock');
      return [];
    }),
    assignmentType: {
      findUnique: mock(async ({ where }: any) =>
        where.id === parent.id ? parent : null
      ),
    },
    assignmentTypePromptVersion: {
      findMany: mock(async ({ where }: any) =>
        versions.filter((r) => matches(r, where))
      ),
      findFirst: mock(
        async ({ where }: any) =>
          versions
            .filter((r) => matches(r, where))
            .sort((a, b) => b.version - a.version)[0] ?? null
      ),
      findUnique: mock(
        async ({ where }: any) =>
          versions.find((r) => matches(r, where)) ?? null
      ),
      create: mock(async ({ data }: any) => {
        const row = { id: `pv-${versions.length + 1}`, ...data };
        versions.push(row);
        events.push('write');
        return row;
      }),
    },
    assignmentTypeEvaluation: { findMany: mock(async () => []) },
    assignmentTypeEvaluationRun: {
      findMany: mock(async () => []),
      findFirst: mock(async () => null),
    },
    internalPlatformApiAudit: {
      createMany: mock(async ({ data }: any) => {
        audits.push(...data);
        events.push('audit');
      }),
      findFirst: mock(
        async ({ where }: any) =>
          audits.find(
            (r) =>
              r.endpoint === where.endpoint &&
              r.action === where.action &&
              r.actorEmail === where.actorEmail &&
              r.keyId === where.keyId &&
              r.metadata.idempotencyKey === where.metadata.equals
          ) ?? null
      ),
    },
  };
  db.$transaction = mock(async (fn: any, options: any) => {
    expect(options.isolationLevel).toBe('ReadCommitted');
    return fn(db);
  });
  Object.assign(prisma, db);
  const auditRead = mock(async () => {});
  return {
    db,
    versions,
    audits,
    events,
    auditRead,
    handlers: createInternalGradingWorkspaceHandlers({ db, auditRead }),
  };
}
beforeEach(() => {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
    { id: 'writer', secret, scopes: ['management:write', 'management:read'] },
    { id: 'reader', secret, scopes: ['management:read'] },
  ]);
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'x'.repeat(43);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  resetInternalApiMemoryNonceStore();
  resetInternalApiRateLimitBuckets();
  completion.mockClear();
});
afterEach(() => {
  for (const key of [
    'YAWP_INTERNAL_API_KEYS',
    'INTERNAL_API_NONCE_STORE',
    'YAWP_MANAGEMENT_SERVICE_KEY',
  ]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});
test('HMAC authentication and scopes fail before domain access', async () => {
  const f = fixture();
  expect(
    (
      await f.handlers.handle(
        'promptVersions',
        req('GET', '/prompt-versions', undefined, { unsigned: true }),
        'at-1'
      )
    ).status
  ).toBe(401);
  expect(
    (
      await f.handlers.handle(
        'promptVersions',
        req('POST', '/prompt-versions', {}, { keyId: 'reader' }),
        'at-1'
      )
    ).status
  ).toBe(403);
  expect(f.db.$transaction).not.toHaveBeenCalled();
});
test('strict validation, method, raw byte size and UTF-8 errors', async () => {
  const f = fixture();
  for (const [request, status] of [
    [req('PUT', '/prompt-versions', {}), 405],
    [req('POST', '/prompt-versions', { unexpected: true }), 400],
    [req('POST', '/prompt-versions', { reason: ' ' }), 400],
    [
      req('POST', '/prompt-versions', undefined, {
        raw: 'x'.repeat(256 * 1024 + 1),
      }),
      413,
    ],
    [
      req('POST', '/prompt-versions', undefined, {
        raw: new Uint8Array([0xff]),
      }),
      400,
    ],
  ] as const) {
    const res = await f.handlers.handle(
      'promptVersions',
      request as Request,
      'at-1'
    );
    expect(res.status).toBe(status);
    expect(Object.keys(await res.json())).toEqual(['error']);
    expect(res.headers.get('cache-control')).toBe('no-store');
  }
});
test('owned reads are audited and foreign versions/runs return 404', async () => {
  const f = fixture();
  const res = await f.handlers.handle(
    'promptVersions',
    req('GET', '/prompt-versions'),
    'at-1'
  );
  expect((await res.json()).promptVersions).toHaveLength(1);
  expect(f.auditRead).toHaveBeenCalled();
  expect(
    (
      await f.handlers.handle(
        'promptVersion',
        req('GET', '/prompt-versions/pv-1'),
        'other',
        'pv-1'
      )
    ).status
  ).toBe(404);
  expect(
    (
      await f.handlers.handle(
        'promptVersion',
        req('GET', '/prompt-versions/foreign'),
        'at-1',
        'foreign'
      )
    ).status
  ).toBe(404);
  expect(
    (
      await f.handlers.handle(
        'run',
        req('GET', '/evaluation-runs/foreign'),
        'at-1',
        'foreign'
      )
    ).status
  ).toBe(404);
});
test('draft create locks parent, audits signed actor/reason/raw hash, replays and conflicts', async () => {
  const f = fixture();
  const value = { reason: '  Reviewed  ' };
  const path = '/prompt-versions';
  const res = await f.handlers.handle(
    'promptVersions',
    req('POST', path, value, { key: 'draft-1' }),
    'at-1'
  );
  expect(res.status).toBe(201);
  expect((await res.json()).promptVersion.status).toBe('draft');
  expect(f.audits).toHaveLength(2);
  expect(f.events.indexOf('lock')).toBeLessThan(f.events.indexOf('write'));
  expect(f.audits[0]).toMatchObject({
    actorEmail: 'operator@example.test',
    keyId: 'writer',
    result: 'before',
    requestHash: createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex'),
    metadata: { reason: 'Reviewed' },
  });
  expect(f.audits[1].result).toBe('after');
  expect(
    (
      await f.handlers.handle(
        'promptVersions',
        req('POST', path, value, { key: 'draft-1' }),
        'at-1'
      )
    ).status
  ).toBe(200);
  expect(f.versions).toHaveLength(2);
  expect(f.audits).toHaveLength(2);
  expect(
    (
      await f.handlers.handle(
        'promptVersions',
        req('POST', path, { reason: 'Changed' }, { key: 'draft-1' }),
        'at-1'
      )
    ).status
  ).toBe(409);
  expect(completion).not.toHaveBeenCalled();
});
test('a full group rejects a new case after locking and before any writes', async () => {
  const f = fixture();
  f.db.assignmentTypeEvaluation.findFirst = mock(async () => {
    expect(f.events).toContain('lock');
    return {
      id: 'suite-1',
      description: 'Identify the claim',
      cases: Array.from({ length: 20 }, (_, i) => ({ id: `case-${i}` })),
    };
  });
  const result = await f.handlers.handle(
    'cases',
    req('POST', '/evaluation-suites/suite-1/cases', {
      name: 'One too many',
      sample: 'An argument',
      rubricCategoryKey: 'claim',
    }),
    'at-1',
    'suite-1'
  );
  expect(result.status).toBe(409);
  expect(await result.json()).toEqual({
    error: 'Evaluation groups support at most 20 active cases.',
  });
  expect(f.db.assignmentType.findUnique).toHaveBeenCalledTimes(1);
  expect(f.events).toEqual(['lock']);
  expect(f.audits).toHaveLength(0);
});
test('unsupported async run creation returns 405 without model calls', async () => {
  const f = fixture();
  expect(
    (
      await f.handlers.handle(
        'runs',
        req('POST', '/evaluation-runs', {
          promptVersion: 'pv-1',
          suiteId: 's-1',
        }),
        'at-1'
      )
    ).status
  ).toBe(405);
  expect(completion).not.toHaveBeenCalled();
});
test('suite ownership protects case creation and editing', async () => {
  const f = fixture();
  f.db.assignmentTypeEvaluation.findFirst = mock(async () => null);
  expect(
    (
      await f.handlers.handle(
        'cases',
        req('POST', '/evaluation-suites/foreign/cases', {
          name: 'Case',
          sample: 'Essay',
          rubricCategoryKey: 'claim',
        }),
        'at-1',
        'foreign'
      )
    ).status
  ).toBe(404);
  expect(
    (
      await f.handlers.handle(
        'case',
        req('PATCH', '/evaluation-suites/foreign/cases/foreign', {
          name: 'Changed',
        }),
        'at-1',
        'foreign',
        'foreign'
      )
    ).status
  ).toBe(404);
  expect(completion).not.toHaveBeenCalled();
});
test('benchmark filters are strict and model execution is mocked', async () => {
  const f = fixture();
  const list = await f.handlers.handle(
    'benchmarkCases',
    req('GET', '/benchmark?strictness=beginner')
  );
  expect(list.status).toBe(200);
  const cases = (await list.json()).cases;
  expect(cases.length).toBeGreaterThan(0);
  expect(cases.every((c: any) => c.input.strictness === 'beginner')).toBe(true);
  expect(
    (
      await f.handlers.handle(
        'benchmarkCases',
        req('GET', '/benchmark?level=advanced')
      )
    ).status
  ).toBe(400);
  const execute = mock(async ({ purpose }: any) =>
    purpose === 'criterion'
      ? JSON.stringify({ passed: true, evidence: 'Grounded' })
      : JSON.stringify({
          categories: [
            'thesis',
            'evidence',
            'reasoning',
            'organization',
            'style',
            'mechanics',
          ].map((key) => ({ key, score: 3, comment: 'Grounded' })),
          overallComment: 'Jordan, revise the claim.',
        })
  );
  const handlers = createInternalGradingWorkspaceHandlers({
    db: f.db,
    execute,
  });
  const res = await handlers.handle(
    'benchmarkRun',
    req('POST', '/benchmark/cases/run', { reason: 'Reviewed' }),
    undefined,
    cases[0].id
  );
  expect(res.status).toBe(200);
  expect(execute).toHaveBeenCalled();
  expect(f.audits).toHaveLength(2);
  expect(f.audits[1].metadata.reason).toBe('Reviewed');
});
test('scratch returns category scores and check result without evaluation records', async () => {
  const f = fixture();
  const execute = mock(async ({ purpose }: any) =>
    purpose === 'criterion'
      ? JSON.stringify({ passed: true, evidence: 'Grounded' })
      : JSON.stringify({
          categories: [{ key: 'claim', score: 3, comment: 'Grounded' }],
          overallComment: 'Jordan, revise the claim.',
        })
  );
  const handlers = createInternalGradingWorkspaceHandlers({
    db: f.db,
    execute,
  });
  const res = await handlers.handle(
    'scratch',
    req('POST', '/scratch-check', {
      promptVersion: 'pv-1',
      sampleSubmission: 'Essay',
      check: 'Grounded',
      reason: 'Review',
    }),
    'at-1'
  );
  expect(res.status).toBe(200);
  expect((await res.json()).categoryScores).toEqual([
    { key: 'claim', score: 3, comment: 'Grounded' },
  ]);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(f.audits).toHaveLength(2);
  expect(f.audits[1].metadata.after).toEqual({
    status: 'pass',
    promptVersionId: 'pv-1',
  });
  expect(f.db.assignmentTypeEvaluationRun.findMany).not.toHaveBeenCalled();
});

test('every endpoint enforces its read or write scope', async () => {
  const f = fixture();
  const writes = [
    ['promptVersions', 'POST', undefined],
    ['promptVersion', 'PATCH', 'pv-1'],
    ['publish', 'POST', 'pv-1'],
    ['suites', 'POST', undefined],
    ['suite', 'PATCH', 's-1'],
    ['cases', 'POST', 's-1'],
    ['case', 'PATCH', 's-1'],
    ['case', 'DELETE', 's-1'],
    ['scratch', 'POST', undefined],
    ['benchmarkRun', 'POST', 'benchmark-1'],
  ] as const;
  for (const [resource, method, child] of writes) {
    const res = await f.handlers.handle(
      resource,
      req(method, `/${resource}`, {}, { keyId: 'reader' }),
      'at-1',
      child,
      'c-1'
    );
    expect(res.status).toBe(403);
    expect(Object.keys(await res.json())).toEqual(['error']);
  }
  const legacy = new Request(base + '/prompt-versions', {
    headers: { authorization: `Bearer ${'x'.repeat(43)}` },
  });
  expect(
    (await f.handlers.handle('promptVersions', legacy, 'at-1')).status
  ).toBe(401);
  expect(f.db.$transaction).not.toHaveBeenCalled();
});

test('publish rejects unsupported policy and malformed versions; delete accepts only reason', async () => {
  const f = fixture();
  for (const body of [
    { environment: 'demo', acceptedRegressions: [] },
    { environment: 'production', acceptedRegressions: ['failed-case'] },
    {
      environment: 'production',
      acceptedRegressions: [],
      reason: 'x'.repeat(501),
    },
  ]) {
    expect(
      (
        await f.handlers.handle(
          'publish',
          req('POST', '/prompt-versions/pv-1/publish', body),
          'at-1',
          'pv-1'
        )
      ).status
    ).toBe(400);
  }
  expect(
    (
      await f.handlers.handle(
        'promptVersion',
        req('GET', '/prompt-versions/999999999999999999999'),
        'at-1',
        '999999999999999999999'
      )
    ).status
  ).toBe(400);
  expect(
    (
      await f.handlers.handle(
        'case',
        req('DELETE', '/evaluation-suites/s-1/cases/c-1', { name: 'ignored' }),
        'at-1',
        's-1',
        'c-1'
      )
    ).status
  ).toBe(400);
});

test('draft PATCH changes one template while preserving the other and validates variables', async () => {
  const f = fixture();
  f.versions[0].status = 'draft';
  f.db.assignmentTypePromptVersion.update = mock(
    async ({ where, data }: any) => {
      const index = f.versions.findIndex((v) => v.id === where.id);
      f.versions[index] = {
        ...f.versions[index],
        ...data,
        revision: f.versions[index].revision + 1,
      };
      return f.versions[index];
    }
  );
  const invalid = await f.handlers.handle(
    'promptVersion',
    req('PATCH', '/prompt-versions/pv-1', {
      userMessageTemplate: '{{unsupported}}',
    }),
    'at-1',
    'pv-1'
  );
  expect(invalid.status).toBe(400);
  expect(f.db.assignmentTypePromptVersion.update).not.toHaveBeenCalled();
  const res = await f.handlers.handle(
    'promptVersion',
    req('PATCH', '/prompt-versions/pv-1', {
      systemMessageTemplate: 'Revised system',
      reason: 'Reviewed',
    }),
    'at-1',
    'pv-1'
  );
  expect(res.status).toBe(200);
  expect((await res.json()).promptVersion).toMatchObject({
    systemMessageTemplate: 'Revised system',
    userMessageTemplate: '{{document}} {{rubric}}',
    revision: 2,
  });
  expect(f.audits[0].metadata.before.systemMessageTemplate).toBe(
    'Evaluate {{rubric}}'
  );
  expect(f.audits[1].metadata.after.systemMessageTemplate).toBe(
    'Revised system'
  );
});

test('suite PATCH rejects duplicate case IDs', async () => {
  const f = fixture();
  const item = {
    id: 'c-1',
    name: 'Case',
    sample: 'Sample',
    expectedOutput: {
      categories: [{ key: 'claim', score: 3, comment: 'Clear claim' }],
      overallComment: 'Revise',
    },
  };
  expect(
    (
      await f.handlers.handle(
        'suite',
        req('PATCH', '/evaluation-suites/s-1', {
          name: 'Suite',
          check: 'Check',
          cases: [item, item],
        }),
        'at-1',
        's-1'
      )
    ).status
  ).toBe(400);
  expect(f.db.$transaction).not.toHaveBeenCalled();
});

test('scratch default provider adapter requests audit-only persistence', async () => {
  const f = fixture();
  completion.mockImplementation(async ({ metadata }: any) =>
    metadata.kind === 'criterion'
      ? JSON.stringify({ passed: true, evidence: 'Grounded' })
      : JSON.stringify({
          categories: [{ key: 'claim', score: 3, comment: 'Grounded' }],
          overallComment: 'Jordan, explain the claim.',
        })
  );
  const res = await f.handlers.handle(
    'scratch',
    req('POST', '/scratch-check', {
      promptVersion: 'pv-1',
      sampleSubmission: 'Scratch sample',
      check: 'Grounded',
    }),
    'at-1'
  );
  expect(res.status).toBe(200);
  expect(completion).toHaveBeenCalledTimes(2);
  for (const [call] of completion.mock.calls as any)
    expect(call).toMatchObject({
      logPayload: 'audit-only',
      attribution: {
        organizationId: null,
        membershipId: null,
        route: 'api/internal/v1/admin/grading-workspace',
      },
    });
  expect(f.audits).toHaveLength(2);
});
