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
            actor: opts.actor ?? 'Operator@example.test',
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
    parent,
    handlers: createInternalGradingWorkspaceHandlers({ db, auditRead }),
  };
}
beforeEach(() => {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
    { id: 'writer', secret, scopes: ['management:write', 'management:read'] },
    { id: 'reader', secret, scopes: ['management:read'] },
    {
      id: 'writer-two',
      secret,
      scopes: ['management:write', 'management:read'],
    },
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
test('grouped case creation requires full expected output before domain access', async () => {
  const f = fixture();
  for (const expectedOutput of [undefined, null]) {
    const result = await f.handlers.handle(
      'cases',
      req('POST', '/evaluation-suites/suite-1/cases', {
        name: 'Case',
        sample: 'An argument',
        rubricCategoryKey: 'claim',
        expectedOutput,
      }),
      'at-1',
      'suite-1'
    );
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({
      error: 'Invalid grading workspace request',
    });
  }
  expect(f.db.$transaction).not.toHaveBeenCalled();
  expect(f.events).toEqual([]);
  expect(f.audits).toHaveLength(0);
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
      expectedOutput: {
        categories: [{ key: 'claim', score: 3, comment: 'Clear claim' }],
        overallComment: 'Explain the evidence.',
      },
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
test('run creation without an idempotency key returns 400 without model calls', async () => {
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
  ).toBe(400);
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
          expectedOutput: {
            categories: [{ key: 'claim', score: 3, comment: 'Clear claim' }],
            overallComment: 'Explain the evidence.',
          },
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

const runBody = {
  promptVersion: 'pv-1',
  suiteId: 'suite-1',
  reason: 'Reviewed',
};
test('new writes require HMAC, write scope, strict bodies and bounded bytes', async () => {
  for (const [resource, method, path, body, child] of [
    ['runs', 'POST', '/evaluation-runs', runBody, undefined],
    ['suite', 'DELETE', '/evaluation-suites/suite-1', {}, 'suite-1'],
    ['promptVersion', 'DELETE', '/prompt-versions/pv-1', {}, 'pv-1'],
  ] as const) {
    const f = fixture();
    for (const [opts, value, status] of [
      [{ unsigned: true }, body, 401],
      [{ keyId: 'reader' }, body, 403],
      [{}, { ...body, unknown: true }, 400],
      [{}, { ...body, reason: ' ' }, 400],
      [{ raw: 'x'.repeat(256 * 1024 + 1) }, body, 413],
      [{ raw: new Uint8Array([0xff]) }, body, 400],
    ] as const) {
      const res = await f.handlers.handle(
        resource,
        req(method, path, value, opts),
        'at-1',
        child
      );
      expect(res.status).toBe(status);
      expect(Object.keys(await res.json())).toEqual(['error']);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    expect(f.db.$transaction).not.toHaveBeenCalled();
  }
});
test('discard refuses production and foreign versions; draft deletion is audited', async () => {
  const f = fixture();
  f.db.assignmentTypePromptVersion.delete = mock(async ({ where }: any) => {
    f.versions.splice(
      f.versions.findIndex((v) => v.id === where.id),
      1
    );
  });
  for (const [version, status] of [
    ['pv-1', 409],
    ['foreign', 404],
  ] as const) {
    const res = await f.handlers.handle(
      'promptVersion',
      req('DELETE', `/prompt-versions/${version}`, {}),
      'at-1',
      version
    );
    expect(res.status).toBe(status);
    expect(Object.keys(await res.json())).toEqual(['error']);
  }
  f.versions.push({
    ...f.versions[0],
    id: 'draft-2',
    version: 2,
    status: 'draft',
  });
  const res = await f.handlers.handle(
    'promptVersion',
    req('DELETE', '/prompt-versions/2', {
      reason: '  Discard reviewed draft  ',
    }),
    'at-1',
    '2'
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ deleted: { id: 'draft-2' } });
  expect(f.versions).toHaveLength(1);
  expect(f.audits.map((a) => a.result)).toEqual(['before', 'after']);
  expect(f.audits[0].metadata.before.status).toBe('draft');
  expect(f.audits[1].metadata.after).toBeNull();
  expect(f.audits[1].metadata.reason).toBe('Discard reviewed draft');
});
test('new writes scope suites and prompt ownership; run requires an idempotency key', async () => {
  const f = fixture();
  f.db.assignmentTypeEvaluation.findFirst = mock(async () => null);
  for (const [resource, path, value, child] of [
    ['suite', '/evaluation-suites/foreign', {}, 'foreign'],
    ['runs', '/evaluation-runs', { ...runBody, suiteId: 'foreign' }, undefined],
  ] as const) {
    const res = await f.handlers.handle(
      resource,
      req(resource === 'runs' ? 'POST' : 'DELETE', path, value, {
        key: 'owned-run',
      }),
      'at-1',
      child
    );
    expect(res.status).toBe(404);
  }
  const missing = await f.handlers.handle(
    'runs',
    req('POST', '/evaluation-runs', runBody),
    'at-1'
  );
  expect(missing.status).toBe(400);
  expect(completion).not.toHaveBeenCalled();
});

test('suite delete archives cases, refreshes snapshot, and audits both states', async () => {
  const f = fixture();
  const row: any = {
    id: 'suite-1',
    assignmentTypeId: 'at-1',
    archivedAt: null,
    cases: [{ id: 'case-1', archivedAt: null }],
  };
  f.db.assignmentTypeEvaluation.findFirst = mock(async ({ where }: any) =>
    where.id === row.id && !row.archivedAt ? structuredClone(row) : null
  );
  f.db.assignmentTypeEvaluation.updateMany = mock(async ({ data }: any) => {
    Object.assign(row, data);
    return { count: 1 };
  });
  f.db.assignmentTypeEvaluationCase = {
    updateMany: mock(async ({ data }: any) => {
      row.cases.forEach((c: any) => Object.assign(c, data));
      return { count: 1 };
    }),
  };
  f.db.assignmentTypeEvaluationSuiteVersion = {
    findFirst: mock(async () => null),
    create: mock(async ({ data }: any) => ({ id: 'snapshot', ...data })),
  };
  const res = await f.handlers.handle(
    'suite',
    req('DELETE', '/evaluation-suites/suite-1', { reason: ' Retired ' }),
    'at-1',
    'suite-1'
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ deleted: { id: 'suite-1' } });
  expect(row.archivedAt).toBeInstanceOf(Date);
  expect(row.cases[0].archivedAt).toEqual(row.archivedAt);
  expect(f.db.assignmentTypeEvaluationSuiteVersion.create).toHaveBeenCalled();
  expect(f.audits[0].metadata.before.archivedAt).toBeNull();
  expect(f.audits[1].metadata.after.archivedAt).toBeTruthy();
  expect(f.audits[1].metadata.reason).toBe('Retired');
});

function runFixture() {
  const f = fixture();
  const cases = [
    {
      id: 'case-1',
      title: 'Claim',
      documentText: 'A defensible claim.',
      rubricCategoryKey: 'claim',
      criterion: 'A clear claim',
    },
  ];
  const snapshot = {
    id: 'snapshot-1',
    assignmentTypeId: 'at-1',
    version: 1,
    contentHash: 'snapshot-hash',
    snapshotJson: { evaluations: [{ id: 'suite-1', cases }], legacyCases: [] },
  };
  const runs: any[] = [];
  const results: any[] = [];
  f.db.assignmentTypeEvaluation.findFirst = mock(async ({ where }: any) =>
    where.id === 'suite-1' ? { id: 'suite-1', cases } : null
  );
  f.db.assignmentTypeEvaluationSuiteVersion = {
    findFirst: mock(async () => snapshot),
    findUnique: mock(async () => snapshot),
  };
  f.db.assignmentTypeEvaluationRun = {
    findFirst: mock(
      async ({ where }: any) =>
        runs.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ??
        null
    ),
    create: mock(async ({ data }: any) => {
      const run = { id: `run-${runs.length + 1}`, results, ...data };
      runs.push(run);
      return run;
    }),
    update: mock(async ({ where, data }: any) =>
      Object.assign(
        runs.find((r) => r.id === where.id),
        data
      )
    ),
  };
  f.db.assignmentTypeEvaluationResult = {
    createMany: mock(async ({ data }: any) => {
      results.push(...data);
    }),
  };
  f.db.internalPlatformApiAudit.findFirst = mock(
    async ({ where }: any) =>
      [...f.audits]
        .reverse()
        .find((a) =>
          Object.entries(where).every(([field, value]) =>
            field === 'metadata'
              ? a.metadata.idempotencyKey === (value as any).equals
              : a[field] === value
          )
        ) ?? null
  );
  const execute = mock(async ({ purpose }: any) =>
    JSON.stringify(
      purpose === 'criterion'
        ? { passed: true, evidence: 'Grounded' }
        : {
            categories: [{ key: 'claim', score: 3, comment: 'Clear claim' }],
            overallComment: 'Jordan, explain the evidence.',
          }
    )
  );
  return {
    ...f,
    snapshot,
    runs,
    results,
    execute,
    handlers: createInternalGradingWorkspaceHandlers({ db: f.db, execute }),
  };
}
test('run start executes shared admin logic, returns results, replays once and conflicts', async () => {
  const f = runFixture();
  const start = () =>
    f.handlers.handle(
      'runs',
      req('POST', '/evaluation-runs', runBody, { key: 'run-1' }),
      'at-1'
    );
  const first = await start();
  expect(first.status).toBe(201);
  const result = await first.json();
  expect(result.run.status).toBe('completed');
  expect(result.run.results).toHaveLength(1);
  expect(result.run.promptRevision).toBe(1);
  expect(result.run.evaluationSuiteVersionId).toBe('snapshot-1');
  expect(f.execute).toHaveBeenCalledTimes(2);
  const replay = await start();
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(result);
  expect(f.execute).toHaveBeenCalledTimes(2);
  const conflict = await f.handlers.handle(
    'runs',
    req(
      'POST',
      '/evaluation-runs',
      { ...runBody, reason: 'Different' },
      { key: 'run-1' }
    ),
    'at-1'
  );
  expect(conflict.status).toBe(409);
  expect(f.audits).toHaveLength(2);
  expect(f.audits[1].metadata.reason).toBe('Reviewed');
});
test('run rejects oversized snapshots before calling provider', async () => {
  const f = runFixture();
  f.snapshot.snapshotJson.legacyCases = Array.from({ length: 9 }, (_, i) => ({
    id: `c-${i}`,
  })) as any;
  const res = await f.handlers.handle(
    'runs',
    req('POST', '/evaluation-runs', runBody, { key: 'large' }),
    'at-1'
  );
  expect(res.status).toBe(422);
  expect((await res.json()).error).toContain('8');
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.runs).toHaveLength(0);
});
test('run budget aborts provider and returns a clear error without a publishable run', async () => {
  const f = runFixture();
  let signal: AbortSignal | undefined;
  const handlers = createInternalGradingWorkspaceHandlers({
    db: f.db,
    runBudgetMs: 20,
    execute: async (input) => {
      signal = input.signal;
      return new Promise(() => {});
    },
  });
  const res = await handlers.handle(
    'runs',
    req('POST', '/evaluation-runs', runBody, { key: 'timeout' }),
    'at-1'
  );
  expect(res.status).toBe(422);
  expect((await res.json()).error).toContain('time budget');
  expect(signal?.aborted).toBe(true);
  expect(f.runs.some((r) => r.status === 'completed')).toBe(false);
  expect(f.runs[0].status).toBe('failed');
  expect(f.runs[0].completedAt).toBeInstanceOf(Date);
  expect(f.results).toHaveLength(0);
  expect(f.audits.map((a) => a.result)).toEqual(['before', 'after']);
  const replay = await handlers.handle(
    'runs',
    req('POST', '/evaluation-runs', runBody, { key: 'timeout' }),
    'at-1'
  );
  expect(replay.status).toBe(422);
});

test('run covers other active groups in the current snapshot for promotion', async () => {
  const f = runFixture();
  const other = {
    ...f.snapshot.snapshotJson.evaluations[0].cases[0],
    id: 'case-2',
  };
  f.snapshot.snapshotJson.evaluations.push({ id: 'suite-2', cases: [other] });
  const res = await f.handlers.handle(
    'runs',
    req('POST', '/evaluation-runs', runBody, { key: 'full-snapshot' }),
    'at-1'
  );
  expect(res.status).toBe(201);
  const run = (await res.json()).run;
  expect(run.totalCases).toBe(2);
  expect(run.results.map((r: any) => r.caseId)).toEqual(['case-1', 'case-2']);
});
test('run rejects invalid numeric versions and unsupported methods before domain access', async () => {
  const f = fixture();
  for (const version of ['0', '2147483648', '9007199254740993']) {
    const res = await f.handlers.handle(
      'runs',
      req(
        'POST',
        '/evaluation-runs',
        { ...runBody, promptVersion: version },
        { key: 'version' }
      ),
      'at-1'
    );
    expect(res.status).toBe(400);
  }
  for (const [resource, method, path, child] of [
    ['runs', 'DELETE', '/evaluation-runs', undefined],
    ['suite', 'GET', '/evaluation-suites/suite-1', 'suite-1'],
    ['promptVersion', 'POST', '/prompt-versions/2', '2'],
  ] as const) {
    const res = await f.handlers.handle(
      resource,
      req(method, path, {}),
      'at-1',
      child
    );
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: 'Method not allowed' });
  }
  expect(f.db.$transaction).not.toHaveBeenCalled();
});

test('database statement timeout during result persistence returns a bounded error', async () => {
  const f = runFixture();
  f.db.assignmentTypeEvaluationResult.createMany = mock(async () => {
    throw new Error('canceling statement due to statement timeout');
  });
  const res = await f.handlers.handle(
    'runs',
    req('POST', '/evaluation-runs', runBody, { key: 'statement-timeout' }),
    'at-1'
  );
  expect(res.status).toBe(422);
  expect(await res.json()).toEqual({
    error: 'Evaluation run database time budget exceeded; retry the request.',
  });
  expect(f.runs.some((r) => r.status === 'completed')).toBe(false);
  expect(f.runs[0].status).toBe('failed');
  expect(f.audits.map((a) => a.result)).toEqual(['before', 'after']);
});

test('provider execution observes no open transaction in either call', async () => {
  const f = runFixture();
  let open = false;
  const observations: boolean[] = [];
  f.db.$transaction = mock(async (fn: any) => {
    expect(open).toBe(false);
    open = true;
    try {
      return await fn(f.db);
    } finally {
      open = false;
    }
  });
  const handlers = createInternalGradingWorkspaceHandlers({
    db: f.db,
    execute: async (args) => {
      observations.push(open);
      return f.execute(args);
    },
  });
  const res = await handlers.handle(
    'runs',
    req('POST', '/evaluation-runs', runBody, { key: 'probe' }),
    'at-1'
  );
  expect(res.status).toBe(201);
  expect(observations).toEqual([false, false]);
});

test('durable pending key rejects overlap and changed bytes, then replays completion', async () => {
  const f = runFixture();
  let release!: () => void;
  let ready!: () => void;
  const waiting = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handlers = createInternalGradingWorkspaceHandlers({
    db: f.db,
    execute: async (args) => {
      ready();
      await gate;
      return f.execute(args);
    },
  });
  const start = () =>
    handlers.handle(
      'runs',
      req('POST', '/evaluation-runs', runBody, { key: 'pending' }),
      'at-1'
    );
  const running = start();
  await waiting;
  try {
    expect(f.audits.map((a) => a.result)).toEqual(['before']);
    expect(f.runs[0].status).toBe('running');
    const pending = await start();
    expect(pending.status).toBe(409);
    expect(await pending.json()).toEqual({
      error:
        'An evaluation run request is waiting for another write; retry after it completes.',
    });
    const conflict = await handlers.handle(
      'runs',
      req(
        'POST',
        '/evaluation-runs',
        { ...runBody, reason: 'Changed' },
        { key: 'pending' }
      ),
      'at-1'
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toContain('different request');
  } finally {
    release();
  }
  const completed = await running;
  expect(completed.status).toBe(201);
  const replay = await start();
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(await completed.json());
  expect(f.execute).toHaveBeenCalledTimes(2);
});

test('expired pending reservation recovers a crashed run without calling provider again', async () => {
  const f = runFixture();
  f.runs.push({
    id: 'crashed',
    status: 'running',
    assignmentTypeId: 'at-1',
    totalCases: 1,
  });
  f.audits.push({
    action: 'grading-workspace.runs.post.before',
    endpoint:
      'POST /api/internal/v1/admin/assignment-types/at-1/evaluation-runs',
    actorEmail: 'operator@example.test',
    keyId: 'writer',
    result: 'before',
    targetId: 'crashed',
    requestHash: createHash('sha256')
      .update(JSON.stringify(runBody))
      .digest('hex'),
    metadata: {
      idempotencyKey: 'expired',
      expiresAt: new Date(Date.now() - 1).toISOString(),
    },
  });
  const res = await f.handlers.handle(
    'runs',
    req('POST', '/evaluation-runs', runBody, { key: 'expired' }),
    'at-1'
  );
  expect(res.status).toBe(422);
  expect(f.runs[0].status).toBe('failed');
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.audits.at(-1).result).toBe('after');
});

test('discard protects active draft and retired previous version', async () => {
  const f = fixture();
  f.versions[0].status = 'draft';
  f.versions.push({
    ...f.versions[0],
    id: 'retired',
    version: 2,
    status: 'retired',
  });
  for (const id of ['pv-1', 'retired']) {
    const res = await f.handlers.handle(
      'promptVersion',
      req('DELETE', `/prompt-versions/${id}`, {}),
      'at-1',
      id
    );
    expect(res.status).toBe(409);
  }
  expect(f.audits).toHaveLength(0);
});

test('already archived suite returns 404 without writes', async () => {
  const f = fixture();
  f.db.assignmentTypeEvaluation.findFirst = mock(async () => null);
  const res = await f.handlers.handle(
    'suite',
    req('DELETE', '/evaluation-suites/archived', {}),
    'at-1',
    'archived'
  );
  expect(res.status).toBe(404);
  expect(f.audits).toHaveLength(0);
});

test('run supports archived parent, legacy-only snapshot and built-in kind', async () => {
  const f = runFixture();
  f.parent.archivedAt = new Date();
  f.parent.kind = 'thesis_statement';
  f.snapshot.snapshotJson.legacyCases = f.snapshot.snapshotJson.evaluations[0]
    .cases as any;
  f.snapshot.snapshotJson.evaluations = [];
  const res = await f.handlers.handle(
    'runs',
    req('POST', '/evaluation-runs', runBody, { key: 'legacy' }),
    'at-1'
  );
  expect(res.status).toBe(201);
  expect((await res.json()).run.totalCases).toBe(1);
});

test('run rejects empty snapshot and AP History assignment context without provider calls', async () => {
  for (const apHistory of [false, true]) {
    const f = runFixture();
    if (apHistory) f.parent.systemKey = 'ap_history_essay';
    else f.snapshot.snapshotJson.evaluations = [];
    const res = await f.handlers.handle(
      'runs',
      req('POST', '/evaluation-runs', runBody, { key: 'guard' }),
      'at-1'
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(
      apHistory ? 'assignment snapshot' : 'at least one'
    );
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.runs).toHaveLength(0);
  }
});

test('run idempotency is scoped to the signed actor and signing key', async () => {
  for (const changed of [
    { actor: 'Other@example.test' },
    { keyId: 'writer-two' },
  ]) {
    const f = runFixture();
    const first = await f.handlers.handle(
      'runs',
      req('POST', '/evaluation-runs', runBody, { key: 'scoped' }),
      'at-1'
    );
    expect(first.status).toBe(201);
    const other = await f.handlers.handle(
      'runs',
      req('POST', '/evaluation-runs', runBody, { key: 'scoped', ...changed }),
      'at-1'
    );
    expect(other.status).toBe(201);
    expect(f.execute).toHaveBeenCalledTimes(4);
    expect(f.audits).toHaveLength(4);
  }
});

test('provider case errors retain admin failed-case semantics and completed replay', async () => {
  const f = runFixture();
  let calls = 0;
  const handlers = createInternalGradingWorkspaceHandlers({
    db: f.db,
    execute: async () => {
      calls++;
      throw new Error('Provider unavailable');
    },
  });
  const start = () =>
    handlers.handle(
      'runs',
      req('POST', '/evaluation-runs', runBody, { key: 'provider-error' }),
      'at-1'
    );
  const res = await start();
  expect(res.status).toBe(201);
  const run = (await res.json()).run;
  expect(run.status).toBe('completed');
  expect(run.failedCases).toBe(1);
  expect(run.results[0].status).toBe('fail');
  expect((await start()).status).toBe(200);
  expect(calls).toBe(1);
});

test('pre-reservation completed audit records remain replayable', async () => {
  const f = runFixture();
  const start = () =>
    f.handlers.handle(
      'runs',
      req('POST', '/evaluation-runs', runBody, { key: 'legacy-replay' }),
      'at-1'
    );
  const res = await start();
  const expected = await res.json();
  delete f.audits[1].metadata.response;
  const replay = await start();
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(expected);
  expect(f.execute).toHaveBeenCalledTimes(2);
});
