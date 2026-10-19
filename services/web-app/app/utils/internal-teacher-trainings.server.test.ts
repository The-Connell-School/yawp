import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
const sendEmail = mock(async () => {
  throw new Error('Training tests must not send email');
});
mock.module('~/utils/email.server', () => ({ sendEmail }));
mock.module('~/utils/db.server', () => ({ prisma: {} }));
const { createInternalTeacherTrainingHandlers } =
  await import('./internal-teacher-trainings.server');
const {
  signInternalApiRequest,
  resetInternalApiMemoryNonceStore,
  resetInternalApiRateLimitBuckets,
} = await import('./internal-platform-auth.server');
const base = 'https://yawp.test/api/internal/v1/admin/teacher-trainings';
const secret = 'teacher-training-contract-test-secret';
const saved = { ...process.env };
const png = Buffer.from('89504e470d0a1a0a', 'hex');
const image = { contentType: 'image/png', dataBase64: png.toString('base64') };
const video = { name: 'intro.mp4', contentType: 'video/mp4', size: 123 };
const resource = { name: 'guide.pdf', contentType: 'application/pdf', size: 8 };
const parts = [{ partNumber: 1, etag: 'part-etag' }];
const cases = [
  ['create', 'POST', '', { title: 'New training' }],
  ['update', 'PATCH', '/tt-1', { title: 'Edited' }],
  ['delete', 'DELETE', '/tt-1', {}],
  ['replaceImage', 'PUT', '/tt-1/image', image],
  ['removeImage', 'DELETE', '/tt-1/image', {}],
  ['createModule', 'POST', '/tt-1/modules', { title: 'Next' }],
  [
    'updateModule',
    'PATCH',
    '/tt-1/modules/m-1',
    { title: 'Edited', videoDuration: 12 },
  ],
  ['deleteModule', 'DELETE', '/tt-1/modules/m-1', {}],
  [
    'reorderModules',
    'PUT',
    '/tt-1/modules/order',
    { moduleIds: ['m-2', 'm-1'] },
  ],
  ['startVideo', 'POST', '/tt-1/modules/m-1/video/upload-url', video],
  [
    'completeVideo',
    'POST',
    '/tt-1/modules/m-1/video/complete',
    { uploadId: 'upload-1', parts },
  ],
  ['deleteVideo', 'DELETE', '/tt-1/modules/m-1/video', {}],
  ['startResource', 'POST', '/tt-1/modules/m-1/resources/upload-url', resource],
  [
    'completeResource',
    'POST',
    '/tt-1/modules/m-1/resources/complete',
    { uploadId: 'upload-1', parts },
  ],
  ['deleteResource', 'DELETE', '/tt-1/modules/m-1/resources/r-1', {}],
] as const;
function request(
  method: string,
  path: string,
  value?: unknown,
  options: {
    raw?: string | Uint8Array<ArrayBuffer>;
    unsigned?: boolean;
    scopes?: string[];
    idempotency?: string;
  } = {}
) {
  const body =
    options.raw ?? (value === undefined ? '' : JSON.stringify(value));
  const url = base + path;
  const headers = options.unsigned
    ? new Headers()
    : new Headers(
        signInternalApiRequest({
          method,
          url,
          body,
          keyId: 'tt-key',
          secret,
          actor: 'Operator@example.test',
        }).headers
      );
  headers.set('idempotency-key', options.idempotency ?? randomUUID());
  return new Request(url, {
    method,
    ...(method === 'GET' ? {} : { body }),
    headers,
  });
}
// Model Prisma's explicit projections so tests fail if mapping depends on bytes.
function project(row: any, args: any): any {
  if (row == null || !args?.select) return row;
  return Object.fromEntries(
    Object.entries(args.select).filter(([, value]) => value).map(([key, value]) => [
      key,
      value === true ? row[key] : Array.isArray(row[key])
        ? row[key].map((child: any) => project(child, value))
        : project(row[key], value),
    ])
  );
}
function expectMetadataSelect(args: any) {
  expect(args.include).toBeUndefined();
  expect(args.select.image.select).toEqual({ id: true, contentType: true, altText: true });
  const modules = args.select.teacherTrainingModules;
  expect(modules.include).toBeUndefined();
  expect(modules.select.resources.select).toEqual({
    id: true, name: true, contentType: true, createdAt: true, updatedAt: true,
  });
  expect(JSON.stringify(args.select)).not.toContain('blob');
}
function fixture() {
  const now = new Date('2026-10-01T00:00:00Z');
  let current: any = {
    id: 'tt-1',
    title: 'Training',
    description: null,
    position: 0,
    createdAt: now,
    updatedAt: now,
    image: null,
    resources: [],
    teacherTrainingModules: [
      {
        id: 'm-1',
        title: 'First',
        description: null,
        position: 0,
        videoS3Key: null,
        videoDuration: 60,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        resources: [
          {
            id: 'r-1',
            name: 'Guide',
            contentType: 'application/pdf',
            blob: Buffer.from('%PDF-1.7'),
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      {
        id: 'm-2',
        title: 'Second',
        description: null,
        position: 1,
        videoS3Key: null,
        videoDuration: 30,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        resources: [],
      },
    ],
  };
  const audits: any[] = [];
  const events: string[] = [];
  const modules = () => current?.teacherTrainingModules ?? [];
  const db: any = {
    $queryRaw: mock(async (query: any) => {
      if (String(query).includes('octet_length')) {
        return [
          ...modules().flatMap((m: any) => m.resources.map((r: any) => ({
            kind: 'resource', id: r.id, byteLength: r.byteLength ?? r.blob.byteLength,
          }))),
          ...(current?.image ? [{ kind: 'image', id: current.image.id,
            byteLength: current.image.size ?? current.image.blob.byteLength }] : []),
        ];
      }
      events.push(String(query).includes('FOR UPDATE') ? 'lock' : 'advisory');
      return [];
    }),
    $transaction: mock(async (fn: any) => fn(db)),
    teacherTraining: {
      count: mock(async () => 1),
      findUnique: mock(async (args: any) => {
        events.push('read');
        return current?.id === args.where.id ? project(current, args) : null;
      }),
      findMany: mock(async () => (current ? [current] : [])),
      create: mock(async ({ data }: any) => {
        current = {
          ...current,
          ...data,
          id: 'tt-new',
          teacherTrainingModules: [],
          image: null,
        };
        return current;
      }),
      update: mock(async ({ data }: any) => {
        Object.assign(current, data);
        return current;
      }),
      delete: mock(async () => {
        const old = current;
        current = null;
        return old;
      }),
    },
    teacherTrainingModule: {
      count: mock(async () => modules().length),
      findMany: mock(async () => modules()),
      create: mock(async ({ data }: any) => {
        const row = {
          id: 'm-new',
          description: null,
          videoDuration: null,
          videoS3Key: null,
          resources: [],
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        modules().push(row);
        return row;
      }),
      update: mock(async ({ where, data }: any) => {
        const row = modules().find((m: any) => m.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      delete: mock(async ({ where }: any) => {
        const old = modules().find((m: any) => m.id === where.id);
        current.teacherTrainingModules = modules().filter(
          (m: any) => m.id !== where.id
        );
        return old;
      }),
    },
    teacherTrainingImage: {
      deleteMany: mock(async () => {
        current.image = null;
      }),
      create: mock(async ({ data }: any) => {
        current.image = { id: 'image-1', altText: null, ...data };
        return current.image;
      }),
    },
    teacherTrainingModuleResource: {
      create: mock(async ({ data }: any) => {
        const row = { id: 'r-new', createdAt: now, updatedAt: now, ...data };
        modules()
          .find((m: any) => m.id === data.teacherTrainingModuleId)
          .resources.push(row);
        return row;
      }),
      delete: mock(async ({ where }: any) => {
        for (const m of modules())
          m.resources = m.resources.filter((r: any) => r.id !== where.id);
      }),
    },
    internalPlatformApiAudit: {
      createMany: mock(async ({ data }: any) => {
        audits.push(...structuredClone(data));
      }),
      findFirst: mock(
        async ({ where }: any) =>
          [...audits].reverse().find((a) =>
            Object.entries(where).every(([k, v]: any) => {
              if (k !== 'metadata') return a[k] === v;
              return (
                v.path.reduce((x: any, p: string) => x?.[p], a.metadata) ===
                v.equals
              );
            })
          ) ?? null
      ),
    },
  };
  const media = {
    createUpload: mock(async (input: any) => ({
      ...input,
      uploadId: 'upload-1',
      key: `teacher-trainings/tt-1/modules/m-1/${input.kind}/${randomUUID()}`,
      partSize: 16 * 1024 * 1024,
      partCount: Math.ceil(input.size / (16 * 1024 * 1024)),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    })),
    signUpload: mock(async (upload: any) => ({
      ...upload,
      parts: Array.from({ length: upload.partCount }, (_, i) => ({
        partNumber: i + 1,
        url: 'https://s3.example.test/part',
      })),
      expiresIn: 3600,
    })),
    completeUpload: mock(async (upload: any) =>
      upload.kind === 'resource' ? Buffer.from('%PDF-1.7') : undefined
    ),
  };
  const auditRead = mock(async (_args: any) => {});
  const handlers = createInternalTeacherTrainingHandlers({
    db,
    media,
    auditRead,
  });
  const invoke = (
    op: string,
    req: Request,
    ids: any = { id: 'tt-1', moduleId: 'm-1', resourceId: 'r-1' }
  ) => handlers.handle(op as never, req, ids);
  async function prepare(op: string) {
    if (op === 'completeVideo' || op === 'completeResource') {
      const kind = op === 'completeVideo' ? 'Video' : 'Resource';
      expect(
        (
          await invoke(
            `start${kind}`,
            request(
              'POST',
              `/tt-1/modules/m-1/${kind === 'Video' ? 'video' : 'resources'}/upload-url`,
              kind === 'Video' ? video : resource
            )
          )
        ).status
      ).toBe(201);
    }
  }
  return {
    handlers,
    invoke,
    db,
    audits,
    events,
    media,
    auditRead,
    prepare,
    current: () => current,
    missing: () => {
      current = null;
    },
  };
}
beforeEach(() => {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
    { id: 'tt-key', secret, scopes: ['management:read', 'management:write'] },
  ]);
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'x'.repeat(43);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  resetInternalApiMemoryNonceStore();
  resetInternalApiRateLimitBuckets();
});
afterEach(() => {
  process.env = { ...saved };
});

for (const [op, method, path, value] of cases) {
  describe(op, () => {
    test('HMAC-only, scoped, strict, bounded, method-checked and parent-owned', async () => {
      const f = fixture();
      expect(
        (await f.invoke(op, request(method, path, value, { unsigned: true })))
          .status
      ).toBe(401);
      process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
        { id: 'tt-key', secret, scopes: ['management:read'] },
      ]);
      expect((await f.invoke(op, request(method, path, value))).status).toBe(
        403
      );
      process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
        { id: 'tt-key', secret, scopes: ['management:write'] },
      ]);
      expect((await f.invoke(op, request('OPTIONS', path, value))).status).toBe(
        405
      );
      for (const raw of [
        '{',
        JSON.stringify({ ...value, unknown: true }),
        JSON.stringify({ ...value, reason: '  ' }),
        JSON.stringify({ ...value, reason: 'x'.repeat(501) }),
        new Uint8Array([0xff]),
      ]) {
        const res = await f.invoke(
          op,
          request(method, path, undefined, { raw })
        );
        expect(res.status).toBe(400);
        expect(Object.keys(await res.json())).toEqual(['error']);
      }
      const oversized = request(method, path, value);
      oversized.headers.set('content-length', String(9 * 1024 * 1024));
      expect((await f.invoke(op, oversized)).status).toBe(413);
      expect(f.db.$transaction).not.toHaveBeenCalled();
      if (op !== 'create') {
        f.missing();
        expect((await f.invoke(op, request(method, path, value))).status).toBe(
          404
        );
      }
    });
    test('happy path has paired attributed audits, trimmed reason and raw SHA256', async () => {
      const f = fixture();
      await f.prepare(op);
      f.events.length = 0;
      const body = { ...value, reason: '  Maintain training  ' };
      const result = await f.invoke(op, request(method, path, body));
      expect(result.status).toBe(method === 'POST' ? 201 : 200);
      expect(result.headers.get('cache-control')).toBe('no-store');
      const pair = f.audits.slice(-2);
      expect(pair.map((a) => a.result)).toEqual(['before', 'after']);
      for (const a of pair) {
        expect(a.actorEmail).toBe('operator@example.test');
        expect(a.keyId).toBe('tt-key');
        expect(a.metadata.reason).toBe('Maintain training');
        expect(a.requestHash).toBe(
          createHash('sha256').update(JSON.stringify(body)).digest('hex')
        );
      }
      expect(f.db.$transaction.mock.calls.at(-1)?.[1]).toEqual({
        isolationLevel: 'ReadCommitted',
        timeout: 30000,
      });
      if (op !== 'create')
        expect(f.events.indexOf('lock')).toBeLessThan(f.events.indexOf('read'));
      expect(JSON.stringify(pair)).not.toContain('"blob"');
      expect(JSON.stringify(pair)).not.toContain('https://s3.');
      for (const [args] of f.db.teacherTraining.findUnique.mock.calls) expectMetadataSelect(args);
      if (op === 'replaceImage')
        expect(pair[1].metadata.after.teacherTraining.image).toMatchObject({
          size: png.length,
        });
      for (const delegate of [f.db.teacherTrainingImage, f.db.teacherTrainingModuleResource]) {
        for (const method of ['create', 'delete']) {
          for (const [args] of delegate[method]?.mock.calls ?? []) expect(args.select).toEqual({ id: true });
        }
      }
      if (op === 'delete')
        expect(await result.json()).toEqual({ deleted: { id: 'tt-1' } });
      if (op === 'deleteModule')
        expect(f.db.teacherTrainingModule.delete).toHaveBeenCalledTimes(1);
      if (op === 'deleteResource')
        expect(f.db.teacherTrainingModuleResource.delete).toHaveBeenCalledTimes(
          1
        );
    });
    if (method === 'POST')
      test('create replays once and different bytes conflict under the advisory lock', async () => {
        const f = fixture();
        await f.prepare(op);
        const send = (body: unknown) =>
          f.invoke(op, request(method, path, body, { idempotency: 'retry' }));
        const first = await send(value);
        expect(first.status).toBe(201);
        const count = f.audits.length;
        expect((await send(value)).status).toBe(200);
        expect(f.audits).toHaveLength(count);
        expect((await send({ ...value, reason: 'Changed bytes' })).status).toBe(
          409
        );
        expect(f.events).toContain('advisory');
      });
  });
}
test('detail, title PATCH and deletes return metadata without reading existing large bytes', async () => {
  const f = fixture();
  const row = f.current();
  const size = 25 * 1024 * 1024; // Legacy resources may exceed today's upload cap.
  const unreadable = () => { throw new Error('Existing bytes must never reach the API'); };
  row.image = { id: 'img-1', contentType: 'image/png', altText: null, size };
  Object.defineProperty(row.image, 'blob', { get: unreadable });
  row.teacherTrainingModules[0].resources = Array.from({ length: 25 }, (_, i) => {
    const resource = {
      id: `large-${i}`, name: `Legacy ${i}`, contentType: 'application/pdf',
      byteLength: size, createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
    Object.defineProperty(resource, 'blob', { get: unreadable });
    return resource;
  });
  for (const [op, method, body] of [
    ['detail', 'GET', undefined], ['update', 'PATCH', { title: 'Small edit' }],
  ] as const) {
    const response = await f.invoke(op, request(method, '/tt-1', body));
    expect(response.status).toBe(200);
    const training = (await response.json()).teacherTraining;
    expect(training.modules[0].resources).toHaveLength(25);
    expect(training.modules[0].resources.every((r: any) => r.byteLength === size)).toBe(true);
    expect(training.image).toEqual({ id: 'img-1', contentType: 'image/png', altText: null });
  }
  for (const snapshot of [f.audits[0].metadata.before, f.audits[1].metadata.after]) {
    expect(snapshot.teacherTraining.image.size).toBe(size);
    expect(snapshot.teacherTraining.image.sha256).toBeUndefined();
    expect(snapshot.teacherTraining.modules[0].resources[0]).toMatchObject({ byteLength: size });
    expect(snapshot.teacherTraining.modules[0].resources[0].sha256).toBeUndefined();
  }
  expect((await f.invoke('deleteResource', request('DELETE', '/tt-1/modules/m-1/resources/large-0', {}), {
    id: 'tt-1', moduleId: 'm-1', resourceId: 'large-0',
  })).status).toBe(200);
  expect(f.db.teacherTrainingModuleResource.delete.mock.calls[0][0].select).toEqual({ id: true });
  expect((await f.invoke('delete', request('DELETE', '/tt-1', {}))).status).toBe(200);
  for (const [args] of f.db.teacherTraining.findUnique.mock.calls) expectMetadataSelect(args);
  const sizes = f.db.$queryRaw.mock.calls.filter(([query]: any) => String(query).includes('octet_length'));
  expect(sizes.length).toBeGreaterThan(0);
  for (const [query, ...values] of sizes) {
    const sql = String(query);
    expect(sql).toContain('octet_length');
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    expect(sql).not.toMatch(/(?:digest|sha256)/i);
    expect(values).toContain('tt-1');
  }
});
test('signed read list and detail are scoped and audited with ordered modules/resources', async () => {
  const f = fixture();
  for (const op of ['list', 'detail']) {
    expect(
      (
        await f.invoke(
          op,
          request('GET', op === 'list' ? '' : '/tt-1', undefined, {
            unsigned: true,
          })
        )
      ).status
    ).toBe(401);
    const response = await f.invoke(
      op,
      request('GET', op === 'list' ? '' : '/tt-1')
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    const training =
      op === 'list' ? data.teacherTrainings[0] : data.teacherTraining;
    expect(training).toMatchObject({
      title: 'Training',
      moduleCount: 2,
      totalLength: 90,
      updatedAt: '2026-10-01T00:00:00.000Z',
      image: null,
    });
    if (op === 'detail')
      expect(training.modules[0].resources[0]).toMatchObject({
        id: 'r-1',
        byteLength: 8,
      });
  }
  expect(f.auditRead).toHaveBeenCalledTimes(2);
  expect((await f.invoke('list', request('GET', '?limit=0'))).status).toBe(400);
  expect(
    (await f.invoke('detail', request('GET', '/tt-1'), { id: 'other' })).status
  ).toBe(404);
});
test('ownership includes module, resource and exact reorder set', async () => {
  const f = fixture();
  for (const [op, method, path, value] of cases.filter(
    ([op]) =>
      /Module|Video|Resource/.test(op) &&
      !['createModule', 'reorderModules'].includes(op)
  )) {
    expect(
      (
        await f.invoke(op, request(method, path, value), {
          id: 'tt-1',
          moduleId: 'foreign',
          resourceId: 'r-1',
        })
      ).status
    ).toBe(404);
  }
  expect(
    (
      await f.invoke(
        'deleteResource',
        request('DELETE', '/tt-1/modules/m-1/resources/foreign'),
        { id: 'tt-1', moduleId: 'm-1', resourceId: 'foreign' }
      )
    ).status
  ).toBe(404);
  for (const moduleIds of [[], ['m-1'], ['m-1', 'm-1'], ['m-1', 'foreign']])
    expect(
      (
        await f.invoke(
          'reorderModules',
          request('PUT', '/tt-1/modules/order', { moduleIds })
        )
      ).status
    ).toBe(400);
  expect(f.db.teacherTrainingModule.update).not.toHaveBeenCalled();
});
test('raw HMAC prevents body changes, invalid UTF8 and legacy auth cannot write', async () => {
  const f = fixture();
  const signed = request('POST', '', { title: 'Original' });
  expect(
    (
      await f.invoke(
        'create',
        new Request(base, {
          method: 'POST',
          headers: signed.headers,
          body: '{"title":"Changed"}',
        })
      )
    ).status
  ).toBe(401);
  const legacy = createInternalTeacherTrainingHandlers({
    db: f.db,
    authenticate: (async () => ({
      mode: 'legacy',
      actorEmail: 'forged',
      keyId: 'legacy',
    })) as never,
  });
  expect(
    (await legacy.handle('create', request('POST', '', { title: 'New' })))
      .status
  ).toBe(401);
});
test('image restricts PNG/JPG, canonical base64, magic bytes and decoded 5 MiB', async () => {
  const f = fixture();
  for (const body of [
    { ...image, contentType: 'image/gif' },
    { ...image, contentType: 'image/jpeg' },
    { ...image, dataBase64: '!!!!' },
    { ...image, dataBase64: 'a===' },
  ])
    expect(
      (await f.invoke('replaceImage', request('PUT', '/tt-1/image', body)))
        .status
    ).toBe(400);
  const large = Buffer.alloc(5 * 1024 * 1024);
  png.copy(large);
  expect(
    (
      await f.invoke(
        'replaceImage',
        request('PUT', '/tt-1/image', {
          ...image,
          dataBase64: large.toString('base64'),
        })
      )
    ).status
  ).toBe(200);
  expect(
    (
      await f.invoke(
        'replaceImage',
        request('PUT', '/tt-1/image', {
          ...image,
          dataBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'),
        })
      )
    ).status
  ).toBe(413);
});
test('upload schemas cap video/resource size and types before S3, validate completion parts and session ownership', async () => {
  const f = fixture();
  for (const [op, input] of [
    ['startVideo', { ...video, size: 2 * 1024 ** 3 + 1 }],
    ['startVideo', { ...video, contentType: 'text/plain' }],
    ['startResource', { ...resource, size: 20 * 1024 ** 2 + 1 }],
    ['startResource', { ...resource, contentType: 'application/x-msdownload' }],
  ])
    expect(
      (
        await f.invoke(
          op as string,
          request('POST', '/tt-1/modules/m-1/upload-url', input)
        )
      ).status
    ).toBe(400);
  expect(f.media.createUpload).not.toHaveBeenCalled();
  expect(
    (
      await f.invoke(
        'completeVideo',
        request('POST', '/tt-1/modules/m-1/video/complete', {
          uploadId: 'foreign',
          parts,
        })
      )
    ).status
  ).toBe(404);
  await f.prepare('completeVideo');
  for (const invalid of [
    [],
    [...parts, ...parts],
    [{ partNumber: 2, etag: 'etag' }],
  ])
    expect(
      (
        await f.invoke(
          'completeVideo',
          request('POST', '/tt-1/modules/m-1/video/complete', {
            uploadId: 'upload-1',
            parts: invalid,
          })
        )
      ).status
    ).toBe(400);
  expect(f.media.completeUpload).not.toHaveBeenCalled();
  expect(
    (
      await f.invoke(
        'completeVideo',
        request('POST', '/tt-1/modules/m-1/video/complete', {
          uploadId: 'upload-1',
          parts,
        })
      )
    ).status
  ).toBe(201);
  expect(
    (
      await f.invoke(
        'completeVideo',
        request('POST', '/tt-1/modules/m-1/video/complete', {
          uploadId: 'upload-1',
          parts,
        })
      )
    ).status
  ).toBe(409);
});
test('actual streamed bytes enforce the default limit before auth and cancel input', async () => {
  const f = fixture();
  const authenticate = mock(async () => {
    throw Error('too late');
  });
  const handler = createInternalTeacherTrainingHandlers({
    db: f.db,
    authenticate,
  });
  const cancel = mock(() => {});
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        pulls++;
        c.enqueue(new Uint8Array(128 * 1024));
      },
      cancel,
    },
    { highWaterMark: 0 }
  );
  const response = await handler.handle(
    'create',
    new Request(base, {
      method: 'POST',
      body: stream,
      duplex: 'half',
      headers: { 'content-length': '2' },
    } as RequestInit)
  );
  expect(response.status).toBe(413);
  expect(pulls).toBe(3);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(authenticate).not.toHaveBeenCalled();
});

test('read contracts reject write-only keys, unsupported methods, duplicate queries and invalid identifiers', async () => {
  const f = fixture();
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
    { id: 'tt-key', secret, scopes: ['management:write'] },
  ]);
  for (const op of ['list', 'detail'])
    expect(
      (await f.invoke(op, request('GET', op === 'list' ? '' : '/tt-1'))).status
    ).toBe(403);
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
    { id: 'tt-key', secret, scopes: ['management:read'] },
  ]);
  expect(
    (await f.invoke('list', request('GET', '?limit=2&limit=3'))).status
  ).toBe(400);
  expect((await f.invoke('list', request('GET', '?unknown=true'))).status).toBe(
    400
  );
  expect(
    (await f.invoke('detail', request('GET', '/tt-1'), { id: '../escape' }))
      .status
  ).toBe(400);
  expect((await f.invoke('detail', request('POST', '/tt-1'))).status).toBe(405);
  expect(f.auditRead).not.toHaveBeenCalled();
});
test('replay cannot resurrect deleted records or consumed/expired upload sessions', async () => {
  const f = fixture();
  const start = () =>
    f.invoke(
      'startVideo',
      request('POST', '/tt-1/modules/m-1/video/upload-url', video, {
        idempotency: 'video-retry',
      })
    );
  expect((await start()).status).toBe(201);
  expect(
    (
      await f.invoke(
        'completeVideo',
        request('POST', '/tt-1/modules/m-1/video/complete', {
          uploadId: 'upload-1',
          parts,
        })
      )
    ).status
  ).toBe(201);
  expect((await start()).status).toBe(409);
  const g = fixture();
  await g.prepare('completeVideo');
  g.audits[1].metadata.after.upload.expiresAt = new Date(0).toISOString();
  expect(
    (
      await g.invoke(
        'completeVideo',
        request('POST', '/tt-1/modules/m-1/video/complete', {
          uploadId: 'upload-1',
          parts,
        })
      )
    ).status
  ).toBe(409);
  const h = fixture();
  const create = () =>
    h.invoke(
      'create',
      request('POST', '', { title: 'New' }, { idempotency: 'create-retry' })
    );
  expect((await create()).status).toBe(201);
  h.missing();
  expect((await create()).status).toBe(409);
});
test('upload ownership binds signed operator and errors never expose SDK details', async () => {
  const f = fixture();
  await f.prepare('completeVideo');
  f.audits[1].actorEmail = 'other@example.test';
  expect(
    (
      await f.invoke(
        'completeVideo',
        request('POST', '/tt-1/modules/m-1/video/complete', {
          uploadId: 'upload-1',
          parts,
        })
      )
    ).status
  ).toBe(404);
  f.audits[1].actorEmail = 'operator@example.test';
  f.media.completeUpload.mockRejectedValueOnce(
    new Error('sensitive SDK details')
  );
  const result = await f.invoke(
    'completeVideo',
    request('POST', '/tt-1/modules/m-1/video/complete', {
      uploadId: 'upload-1',
      parts,
    })
  );
  expect(result.status).toBe(502);
  expect(await result.json()).toEqual({
    error: 'Teacher training operation failed',
  });
  expect(f.db.teacherTrainingModule.update).not.toHaveBeenCalled();
});

test('training writes never send email', () => {
  expect(sendEmail).not.toHaveBeenCalled();
});

test('read and auth infrastructure failures retain the JSON-only error contract', async () => {
  const f = fixture();
  f.db.teacherTraining.findMany.mockRejectedValueOnce(
    new Error('private database details')
  );
  const read = await f.invoke('list', request('GET', ''));
  expect(read.status).toBe(502);
  expect(await read.json()).toEqual({
    error: 'Teacher training operation failed',
  });
  const handler = createInternalTeacherTrainingHandlers({
    db: f.db,
    authenticate: async () => {
      throw new Error('private auth storage details');
    },
  });
  const auth = await handler.handle(
    'create',
    request('POST', '', { title: 'New' })
  );
  expect(auth.status).toBe(502);
  expect(await auth.json()).toEqual({
    error: 'Teacher training operation failed',
  });
});
