import { beforeEach, describe, expect, mock, test } from 'bun:test';

mock.module('@app/prisma', () => ({
  Prisma: {},
  PrismaClient: class {},
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    internalApiRequestNonce: {
      deleteMany: mock(async () => ({})),
      create: mock(async () => ({})),
    },
    internalPlatformApiAudit: {
      create: mock(async () => ({})),
    },
  },
}));

const { createInternalAssignmentTypeHandlers } = await import('./internal-assignment-types.server');
const {
  resetInternalApiMemoryNonceStore,
  resetInternalApiRateLimitBuckets,
  signInternalApiRequest,
} = await import('./internal-platform-auth.server');

const SECRET = 'assignment-types-secret-32-characters';
const keyConfig = JSON.stringify([
  { id: 'assignment-types-key', secret: SECRET, scopes: ['management:read'] },
  { id: 'flags-only-key', secret: SECRET, scopes: ['flags:read'] },
]);

const now = new Date('2026-10-14T12:00:00.000Z');

function signed(url: string, keyId = 'assignment-types-key') {
  const signed = signInternalApiRequest({
    method: 'GET',
    url,
    keyId,
    secret: SECRET,
    actor: 'operator@yawp.school',
  });
  return new Request(url, { headers: signed.headers });
}

function listRow(id: string, createdAt: Date) {
  return {
    id,
    title: `Assignment Type ${id}`,
    kind: 'writing',
    systemKey: id,
    description: null,
    archivedAt: null,
    createdAt,
    updatedAt: createdAt,
    scoringScaleJson: null,
    rubricJson: null,
    image: null,
    rubric: null,
    rubricBaseline: null,
    assignmentModules: [],
    _count: { organizationAssignments: 0 },
  };
}

function makePagedDb(rows: ReturnType<typeof listRow>[]) {
  const reads: unknown[] = [];
  const sorted = [...rows].sort((a, b) => {
    const byCreated = b.createdAt.getTime() - a.createdAt.getTime();
    return byCreated || b.id.localeCompare(a.id);
  });
  return {
    reads,
    db: {
      assignmentType: {
        findMany: async (args: { take?: number; where?: { OR?: unknown[] } }) => {
          reads.push(args);
          const cursor = args.where?.OR as
            | [{ createdAt?: { lt?: Date } }, { createdAt?: Date; id?: { lt?: string } }]
            | undefined;
          const afterCreatedAt = cursor?.[0]?.createdAt?.lt;
          const tieCreatedAt = cursor?.[1]?.createdAt;
          const afterId = cursor?.[1]?.id?.lt;
          const filtered = afterCreatedAt && tieCreatedAt && afterId
            ? sorted.filter((row) => row.createdAt < afterCreatedAt || (row.createdAt.getTime() === tieCreatedAt.getTime() && row.id < afterId))
            : sorted;
          return filtered.slice(0, args.take ?? filtered.length);
        },
        findUnique: async () => null,
      },
      rubricRelease: {
        findMany: async () => [],
      },
    },
  };
}

function makeDb() {
  let listReads = 0;
  let detailReads = 0;
  const row = {
    id: 'at-1',
    title: 'Daily Pages',
    kind: 'daily_pages',
    systemKey: 'daily-pages',
    description: 'Daily writing',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    scoringScaleJson: null,
    rubricJson: null,
    image: { id: 'img-1', altText: 'Notebook', contentType: 'image/png' },
    rubric: {
      id: 'rubric-1',
      name: 'daily-pages-engagement',
      title: 'Daily Pages Engagement',
      currentRevisionId: 'rev-1',
      currentRevision: { id: 'rev-1', version: 3, fingerprint: 'fp-1', createdAt: now },
    },
    rubricBaseline: null,
    assignmentModules: [{ id: 'mod-1' }, { id: 'mod-2' }],
    _count: { organizationAssignments: 4 },
  };
  const detail = {
    ...row,
    tutorInstructions: 'Help students reflect.',
    gradingPromptConfigJson: { mode: 'reflection' },
    gradingOutputSchemaJson: null,
    gradingCalibrationNotes: null,
    gradingAssistantVersion: 7,
    assignmentModules: [
      {
        id: 'mod-1',
        title: 'Warmup',
        description: 'Start here',
        position: 0,
        isSelfGuided: false,
        deletedAt: null,
        instructions: [
          {
            id: 'inst-1',
            title: 'Draft',
            position: 0,
            showChatButton: true,
            showNextButton: true,
            _count: { buttons: 2 },
          },
        ],
      },
    ],
    organizationAssignments: [
      {
        organizationId: 'org-1',
        createdAt: now,
        organization: { id: 'org-1', name: 'Demo Academy' },
      },
    ],
  };
  return {
    reads: () => ({ listReads, detailReads }),
    db: {
      assignmentType: {
        findMany: async () => {
          listReads += 1;
          return [row];
        },
        findUnique: async ({ where }: { where: { id?: string } }) => {
          detailReads += 1;
          return where.id === 'missing' ? null : detail;
        },
      },
      rubricRelease: {
        findMany: async () => [
          {
            catalogKey: 'daily-pages-engagement',
            releasedAt: now,
            rubricRevision: { id: 'rev-1', version: 3, fingerprint: 'fp-1' },
          },
        ],
      },
    },
  };
}

describe('internal assignment type read APIs', () => {
  beforeEach(() => {
    process.env.YAWP_INTERNAL_API_KEYS = keyConfig;
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
    resetInternalApiMemoryNonceStore();
    resetInternalApiRateLimitBuckets();
  });

  test('rejects unsigned and wrong-scope requests before data access', async () => {
    const { db, reads } = makeDb();
    const handler = createInternalAssignmentTypeHandlers({ db: db as never });

    expect((await handler.list(new Request('https://yawp.test/api/internal/v1/admin/assignment-types'))).status).toBe(401);
    expect(reads()).toEqual({ listReads: 0, detailReads: 0 });
    expect((await handler.detail(new Request('https://yawp.test/api/internal/v1/admin/assignment-types/at-1'), 'at-1')).status).toBe(401);
    expect(reads()).toEqual({ listReads: 0, detailReads: 0 });

    const wrongScope = signed('https://yawp.test/api/internal/v1/admin/assignment-types', 'flags-only-key');
    expect((await handler.list(wrongScope)).status).toBe(403);
    expect(reads()).toEqual({ listReads: 0, detailReads: 0 });

    const wrongScopeDetail = signed('https://yawp.test/api/internal/v1/admin/assignment-types/at-1', 'flags-only-key');
    expect((await handler.detail(wrongScopeDetail, 'at-1')).status).toBe(403);
    expect(reads()).toEqual({ listReads: 0, detailReads: 0 });
  });

  test('returns bounded list rows with images, counts, rubric references, and read audit attribution', async () => {
    const { db } = makeDb();
    const audits: unknown[] = [];
    const handler = createInternalAssignmentTypeHandlers({
      db: db as never,
      auditRead: async (input) => {
        audits.push(input);
      },
    });

    const response = await handler.list(signed('https://yawp.test/api/internal/v1/admin/assignment-types?limit=10'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assignmentTypes[0]).toMatchObject({
      id: 'at-1',
      title: 'Daily Pages',
      image: { id: 'img-1', contentType: 'image/png' },
      counts: { modules: 2, organizations: 4 },
      rubricReference: {
        source: 'library',
        catalogKey: 'daily-pages-engagement',
        release: { revisionId: 'rev-1', version: 3 },
      },
    });
    expect(audits[0]).toMatchObject({
      actorEmail: 'operator@yawp.school',
      keyId: 'assignment-types-key',
      endpoint: 'GET /api/internal/v1/admin/assignment-types',
      result: 'assignment-types.list.success',
    });
  });

  test('paginates by the full createdAt and id sort tuple without skipped or duplicated rows', async () => {
    const createdAt = new Date('2026-10-14T12:00:00.000Z');
    const olderAt = new Date('2026-10-13T12:00:00.000Z');
    const oldestAt = new Date('2026-10-12T12:00:00.000Z');
    const { db } = makePagedDb([
      listRow('type-z', olderAt),
      listRow('type-b', createdAt),
      listRow('type-y', oldestAt),
      listRow('type-a', createdAt),
    ]);
    const handler = createInternalAssignmentTypeHandlers({ db: db as never });

    const firstResponse = await handler.list(signed('https://yawp.test/api/internal/v1/admin/assignment-types?limit=2'));
    expect(firstResponse.status).toBe(200);
    const firstPage = await firstResponse.json();
    expect(firstPage.assignmentTypes.map((row: { id: string }) => row.id)).toEqual(['type-b', 'type-a']);
    expect(typeof firstPage.nextCursor).toBe('string');

    const secondResponse = await handler.list(
      signed(`https://yawp.test/api/internal/v1/admin/assignment-types?limit=2&cursor=${firstPage.nextCursor}`)
    );
    expect(secondResponse.status).toBe(200);
    const secondPage = await secondResponse.json();
    expect(secondPage.assignmentTypes.map((row: { id: string }) => row.id)).toEqual(['type-z', 'type-y']);
    expect(secondPage.nextCursor).toBeNull();
  });

  test('returns detail rows with modules and organization assignments', async () => {
    const { db } = makeDb();
    const handler = createInternalAssignmentTypeHandlers({ db: db as never });
    const response = await handler.detail(
      signed('https://yawp.test/api/internal/v1/admin/assignment-types/at-1'),
      'at-1'
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assignmentType).toMatchObject({
      id: 'at-1',
      gradingAssistantVersion: 7,
      grading: { hasPromptConfig: true },
      modules: [{ id: 'mod-1', instructionCount: 1 }],
      organizations: [{ id: 'org-1', name: 'Demo Academy' }],
    });
  });

  test('validates list bounds and missing details', async () => {
    const { db, reads } = makeDb();
    const handler = createInternalAssignmentTypeHandlers({ db: db as never });
    expect((await handler.list(signed('https://yawp.test/api/internal/v1/admin/assignment-types?limit=101'))).status).toBe(400);
    expect(reads().listReads).toBe(0);
    expect((await handler.detail(signed('https://yawp.test/api/internal/v1/admin/assignment-types/missing'), 'missing')).status).toBe(404);
  });
});
