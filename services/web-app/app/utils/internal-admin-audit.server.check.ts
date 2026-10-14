import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
const prisma = {
  internalApiRequestNonce: { create: mock(), deleteMany: mock() },
};
mock.module('~/utils/db.server', () => ({ prisma }));
const {
  signInternalApiRequest,
  resetInternalApiMemoryNonceStore,
  resetInternalApiRateLimitBuckets,
} = await import('./internal-platform-auth.server');
const { createAdminAuditHandlers } =
  await import('./internal-admin-audit.server');
const originalEnv = {
  keys: process.env.YAWP_INTERNAL_API_KEYS,
  nonce: process.env.INTERNAL_API_NONCE_STORE,
};
afterEach(() => {
  for (const [key, value] of Object.entries({
    YAWP_INTERNAL_API_KEYS: originalEnv.keys,
    INTERNAL_API_NONCE_STORE: originalEnv.nonce,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const secret = 'local-unit-test-key-'.repeat(3);
const base = 'http://platform.test/api/internal/v1/admin/audit';
function signed(path = '/document-writes', scopes = ['audit:read']) {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
    { id: 'test', secret, scopes },
  ]);
  const url = new URL(base + path);
  return new Request(url, {
    headers: signInternalApiRequest({
      method: 'GET',
      url: url.toString(),
      actor: 'staff@yawp.test',
      keyId: 'test',
      secret,
    }).headers,
  });
}
function setup() {
  const db = {
    documentWriteJournal: {
      findMany: mock(async (_args: any) => [] as any[]),
      findUnique: mock(async (_args: any) => null as any),
    },
    llmLog: { findMany: mock(async (_args: any) => [] as any[]) },
    user: { findMany: mock(async (_args: any) => [{ id: 'user-1' }]) },
    orgMembership: {
      findMany: mock(async (_args: any) => [{ id: 'member-1' }]),
    },
  };
  const auditRead = mock(async (_: any) => {});
  return {
    db,
    auditRead,
    handlers: createAdminAuditHandlers({ db: db as any, auditRead }),
  };
}
beforeEach(() => {
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  resetInternalApiMemoryNonceStore();
  resetInternalApiRateLimitBuckets();
});
describe('signed admin Audit reads', () => {
  test('denies unsigned, unconfigured, out-of-scope and nonempty GET before payload DB', async () => {
    const { db, handlers } = setup();
    signed();
    expect(
      (await handlers.writes(new Request(base + '/document-writes'))).status
    ).toBe(401);
    expect(
      (await handlers.writes(signed('/document-writes', ['management:read'])))
        .status
    ).toBe(403);
    const body = signed();
    body.headers.set('content-length', '1');
    expect((await handlers.writes(body)).status).toBe(400);
    delete process.env.YAWP_INTERNAL_API_KEYS;
    expect(
      (await handlers.writes(new Request(base + '/document-writes'))).status
    ).toBe(404);
    expect(db.documentWriteJournal.findMany).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
    for (const [path, call] of [
      ['/ai-logs', (r: Request) => handlers.ai(r)],
      [
        '/document-writes/write-1',
        (r: Request) => handlers.detail(r, 'write-1'),
      ],
    ] as const) {
      signed();
      expect((await call(new Request(base + path))).status).toBe(401);
      expect((await call(signed(path, ['management:read']))).status).toBe(403);
      const request = signed(path);
      request.headers.set('transfer-encoding', 'chunked');
      expect((await call(request)).status).toBe(400);
    }
    expect(db.llmLog.findMany).not.toHaveBeenCalled();
    expect(db.documentWriteJournal.findUnique).not.toHaveBeenCalled();
  });
  test('validates limits, duplicate/unknown parameters, dates, cursor and range before reads', async () => {
    const { db, handlers } = setup();
    for (const query of [
      'limit=101',
      'limit=0',
      'limit=1.5',
      'unknown=x',
      'documentId=x&documentId=y',
      'startAt=bad',
      'startAt=2026-02-30',
      'startAt=2026-10-14&endAt=2026-10-01',
      'cursor=bad',
    ]) {
      expect(
        (await handlers.writes(signed('/document-writes?' + query))).status
      ).toBe(400);
    }
    expect(db.documentWriteJournal.findMany).not.toHaveBeenCalled();
  });
  test('shapes previews, strips replayUrl recursively and records operator read', async () => {
    const { db, handlers, auditRead } = setup();
    db.documentWriteJournal.findMany.mockResolvedValueOnce([
      {
        id: 'write-1',
        createdAt: new Date('2026-10-14'),
        eventType: 'write',
        status: 'accepted',
        text: 'x'.repeat(300),
        metadata: {
          replayUrl: 'sensitive',
          nested: [{ replayUrl: 'sensitive', safe: true }],
        },
        unrelated: 'hidden',
      },
    ]);
    const response = await handlers.writes(signed());
    const data = await response.json();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(data.entries[0].textPreview).toBe('x'.repeat(220) + '...');
    expect(data.entries[0].success).toBe(true);
    expect(JSON.stringify(data)).not.toContain('sensitive');
    expect(JSON.stringify(data)).not.toContain('hidden');
    expect(auditRead).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'staff@yawp.test',
        keyId: 'test',
        result: 'audit.document-writes.success',
      })
    );
  });
  test('preserves applicable write user/membership and request/date filters', async () => {
    const { db, handlers } = setup();
    await handlers.writes(
      signed(
        '/document-writes?userOrEmail=staff&documentId=doc&requestId=req&startAt=2026-10-01'
      )
    );
    expect(db.documentWriteJournal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              documentId: 'doc',
              requestId: 'req',
              OR: expect.arrayContaining([
                { userId: { in: ['user-1'] } },
                { membershipId: { in: ['member-1'] } },
              ]),
            }),
          ]),
        }),
      })
    );
  });
  test('uses a strict timestamp/id cursor, bound to kind and filters', async () => {
    const { db, handlers } = setup();
    const date = new Date('2026-10-14');
    db.documentWriteJournal.findMany.mockResolvedValueOnce(
      ['c', 'b', 'a'].map((id) => ({ id, createdAt: date, metadata: null }))
    );
    const first = await (
      await handlers.writes(signed('/document-writes?limit=2'))
    ).json();
    expect(first.entries.map((r: any) => r.id)).toEqual(['c', 'b']);
    await handlers.writes(
      signed('/document-writes?limit=2&cursor=' + first.nextCursor)
    );
    expect(db.documentWriteJournal.findMany.mock.calls[1][0]).toMatchObject({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
      cursor: { id: 'b' },
      skip: 1,
    });
    expect(
      (
        await handlers.writes(
          signed('/document-writes?documentId=other&cursor=' + first.nextCursor)
        )
      ).status
    ).toBe(400);
    expect(
      (await handlers.ai(signed('/ai-logs?cursor=' + first.nextCursor))).status
    ).toBe(400);
  });
  test('AI context fields/filters and metadata redaction', async () => {
    const { db, handlers } = setup();
    db.llmLog.findMany.mockResolvedValueOnce([
      {
        id: 'ai-1',
        createdAt: new Date(),
        model: 'local-fixture',
        provider: 'fixture',
        systemPrompt: 'context',
        messages: [{ role: 'user', content: 'text' }],
        metadata: {
          documentId: 'doc',
          submissionId: 'sub',
          feature: 'grading',
          kind: 'context',
          replayUrl: 'sensitive',
        },
        unrelated: 'hidden',
      },
    ]);
    const data = await (
      await handlers.ai(
        signed(
          '/ai-logs?documentId=doc&submissionId=sub&feature=grading&kind=context'
        )
      )
    ).json();
    expect(data.entries[0]).toMatchObject({
      documentId: 'doc',
      submissionId: 'sub',
      feature: 'grading',
      kind: 'context',
      systemPrompt: 'context',
    });
    expect(JSON.stringify(data)).not.toContain('sensitive');
    expect(JSON.stringify(data)).not.toContain('hidden');
    expect(db.llmLog.findMany.mock.calls[0]![0].where).toMatchObject({
      AND: expect.arrayContaining([
        { metadata: { path: ['submissionId'], equals: 'sub' } },
        { metadata: { path: ['feature'], equals: 'grading' } },
      ]),
    });
  });
  test('missing detail returns 404; detail only returns redacted metadata', async () => {
    const { db, handlers } = setup();
    expect(
      (await handlers.detail(signed('/document-writes/missing'), 'missing'))
        .status
    ).toBe(404);
    db.documentWriteJournal.findUnique.mockResolvedValueOnce({
      metadata: { replayUrl: 'sensitive', safe: 'ok' },
      text: 'hidden',
    });
    expect(
      await (
        await handlers.detail(signed('/document-writes/write-1'), 'write-1')
      ).json()
    ).toEqual({ detail: { metadata: { safe: 'ok' } } });
  });
});
