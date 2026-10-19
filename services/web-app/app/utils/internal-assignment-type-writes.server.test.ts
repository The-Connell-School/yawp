import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';

mock.module('~/utils/db.server', () => ({ prisma: {} }));
const { createInternalAssignmentTypeWriteHandlers } =
  await import('./internal-assignment-type-writes.server');
const {
  signInternalApiRequest,
  resetInternalApiMemoryNonceStore,
  resetInternalApiRateLimitBuckets,
} = await import('./internal-platform-auth.server');
const secret = 'assignment-type-write-test-secret-32';
const previousEnv = { ...process.env };
const base = 'https://yawp.test/api/internal/v1/admin/assignment-types';
const png = Buffer.from('89504e470d0a1a0a0000000049454e44ae426082', 'hex');
const image = {
  contentType: 'image/png',
  dataBase64: png.toString('base64'),
  altText: 'Diagram',
};
function row() {
  return {
    id: 'at-1',
    title: 'Writing',
    kind: null,
    systemKey: null,
    description: 'Keep me',
    tutorInstructions: 'Keep tutor',
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    gradingAssistantVersion: 3,
    gradingPromptConfigJson: { keep: true, gradingInstructionsOverride: 'Old' },
    scoringScaleJson: null,
    rubricJson: null,
    gradingOutputSchemaJson: null,
    gradingCalibrationNotes: null,
    rubric: null,
    rubricBaseline: null,
    allowsImageUploads: false,
    collaborationSupported: false,
    image: null,
    assignmentModules: [],
    organizationAssignments: [],
    _count: { organizationAssignments: 0 },
  };
}
const source = {
  ...row(),
  id: 'source',
  rubricId: null,
  rubricJson: {
    categories: [
      { key: 'quality', label: 'Quality', description: 'Clear', weight: 1 },
    ],
  },
  scoringScaleJson: { min: 1, max: 4 },
  gradingPromptConfigJson: {
    systemInstructions: 'Selected system',
    gradingInstructions: 'Selected grading',
    gradingInstructionsOverride: 'Source override',
  },
};
function fixture(initial = row()) {
  let current: any = initial;
  const events: string[] = [];
  const audits: any[] = [];
  const db = {
    assignmentType: {
      count: mock(async () => 4),
      findUnique: mock(async ({ where }: any) => {
        events.push('read');
        return where.id === 'source' ? source : current;
      }),
      create: mock(async ({ data }: any) => {
        events.push('create');
        current = { ...row(), ...data };
        return current;
      }),
      update: mock(async ({ data }: any) => {
        events.push('update');
        current = {
          ...current,
          ...data,
          gradingAssistantVersion: data.gradingAssistantVersion?.increment
            ? current.gradingAssistantVersion + 1
            : current.gradingAssistantVersion,
        };
        return current;
      }),
    },
    assignmentTypeImage: {
      deleteMany: mock(async () => {
        current.image = null;
      }),
      create: mock(async ({ data }: any) => {
        current.image = { id: 'image-1', ...data };
        return current.image;
      }),
      findUnique: mock(async () => current.image),
    },
    rubric: { findFirst: mock(async () => null) },
    rubricRelease: { findMany: mock(async () => []) },
    internalPlatformApiAudit: {
      findFirst: mock(
        async () =>
          audits.find((a) => a.action === 'assignment-type.create.after') ??
          null
      ),
      createMany: mock(async ({ data }: any) => {
        events.push('audit');
        audits.push(...data);
      }),
    },
    $queryRaw: mock(
      async (_strings: TemplateStringsArray, ..._values: unknown[]) => {
        events.push('lock');
        return [];
      }
    ),
    $transaction: mock(async (fn: any, _options: any) => fn(db)),
  };
  return {
    db,
    events,
    audits,
    missing: () => {
      current = null;
    },
    handlers: createInternalAssignmentTypeWriteHandlers({ db: db as never }),
  };
}
function request(
  method: string,
  path = '',
  value?: unknown,
  options: {
    keyId?: string;
    unsigned?: boolean;
    raw?: string | Uint8Array<ArrayBuffer>;
    signedBody?: string | Uint8Array;
    idempotency?: string;
    legacy?: boolean;
  } = {}
) {
  const body =
    options.raw ?? (value === undefined ? '' : JSON.stringify(value));
  const headers: Record<string, string> = options.unsigned
    ? {}
    : options.legacy
      ? { authorization: `Bearer ${'x'.repeat(43)}` }
      : signInternalApiRequest({
          method,
          url: base + path,
          body: options.signedBody ?? body,
          keyId: options.keyId ?? 'writer',
          secret,
          actor: 'Operator@Yawp.test',
        }).headers;
  if (options.idempotency) headers['Idempotency-Key'] = options.idempotency;
  return new Request(base + path, {
    method,
    headers,
    ...(method !== 'GET' ? { body } : {}),
  });
}
beforeEach(() => {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
    { id: 'writer', secret, scopes: ['management:write'] },
    { id: 'reader', secret, scopes: ['management:read'] },
  ]);
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'x'.repeat(43);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  resetInternalApiMemoryNonceStore();
  resetInternalApiRateLimitBuckets();
});
afterEach(() => {
  for (const key of [
    'YAWP_INTERNAL_API_KEYS',
    'YAWP_MANAGEMENT_SERVICE_KEY',
    'INTERNAL_API_NONCE_STORE',
  ]) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});
const cases = [
  ['create', 'POST', '', { title: 'New' }],
  ['update', 'PATCH', '/at-1', { title: 'Edited' }],
  ['archive', 'POST', '/at-1/archive', undefined],
  ['restore', 'POST', '/at-1/restore', undefined],
  ['replaceImage', 'PUT', '/at-1/image', image],
  ['removeImage', 'DELETE', '/at-1/image', undefined],
] as const;
function invoke(handlers: any, name: string, req: Request, id = 'at-1') {
  return handlers[name](req, id) as Promise<Response>;
}
describe('signed assignment type writes', () => {
  test('rejects a BOM-prefixed body signed over the unprefixed JSON', async () => {
    const { handlers, db } = fixture();
    const text = JSON.stringify({ title: 'Signed' });
    const raw = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]);
    const result = await handlers.update(request('PATCH', '/at-1', undefined, { raw, signedBody: text }), 'at-1');
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: 'Unauthorized' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test('rejects a correctly signed BOM-prefixed body as invalid JSON', async () => {
    const { handlers, db } = fixture();
    const raw = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"title":"Signed"}')]);
    const result = await handlers.update(request('PATCH', '/at-1', undefined, { raw }), 'at-1');
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'Invalid JSON' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test('rejects invalid UTF-8 signed over the decoded replacement character', async () => {
    const { handlers, db } = fixture();
    const raw = Buffer.concat([Buffer.from('{"title":"'), Buffer.from([0xff]), Buffer.from('"}')]);
    const result = await handlers.update(request('PATCH', '/at-1', undefined, { raw, signedBody: '{"title":"\ufffd"}' }), 'at-1');
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: 'Unauthorized' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test.each([
    ['invalid leading byte', [0xff]],
    ['invalid continuation', [0xc3, 0x28]],
  ] as const)('rejects correctly signed UTF-8 with %s before mutation', async (_label, bytes) => {
    const { handlers, db } = fixture();
    const raw = Buffer.concat([Buffer.from('{"title":"'), Buffer.from(bytes), Buffer.from('"}')]);
    const result = await handlers.update(request('PATCH', '/at-1', undefined, { raw }), 'at-1');
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'Invalid JSON' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test.each(['string', 'bytes'])('accepts multibyte UTF-8 signed as %s and audits the wire hash', async (format) => {
    const { handlers, audits } = fixture();
    const title = 'Caf\u00e9 \ud83d\ude00';
    const text = JSON.stringify({ title });
    const raw = format === 'string' ? text : Buffer.from(text, 'utf8');
    const result = await handlers.update(request('PATCH', '/at-1', undefined, { raw }), 'at-1');
    expect(result.status).toBe(200);
    expect((await result.json()).assignmentType.title).toBe(title);
    expect(audits).toHaveLength(2);
    for (const audit of audits) {
      expect(audit.requestHash).toBe(createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'));
    }
  });

  for (const [name, method, path, body] of cases) {
    test(`${name}: unsigned and legacy 401, read-only key 403, wrong method 405`, async () => {
      const { handlers, db } = fixture();
      for (const options of [
        { unsigned: true },
        { legacy: true },
        { keyId: 'reader' },
      ]) {
        expect(
          (await invoke(handlers, name, request(method, path, body, options)))
            .status
        ).toBe('keyId' in options ? 403 : 401);
      }
      expect((await invoke(handlers, name, request('GET', path))).status).toBe(
        405
      );
      expect(db.$transaction).not.toHaveBeenCalled();
    });
    test(`${name}: happy path, signed attribution and transaction audits`, async () => {
      const { handlers, db, events, audits } = fixture();
      const result = await invoke(handlers, name, request(method, path, body));
      expect(result.status).toBe(name === 'create' ? 201 : 200);
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(result.headers.get('referrer-policy')).toBe('no-referrer');
      const payload = await result.json();
      expect(payload.assignmentType).toMatchObject({
        id: 'at-1',
        allowsImageUploads: false,
        collaborationSupported: false,
      });
      expect(db.$transaction.mock.calls[0]?.[1]).toEqual({
        isolationLevel: 'ReadCommitted',
      });
      expect(audits.map((a) => a.result)).toEqual(['before', 'after']);
      for (const a of audits)
        expect(a).toMatchObject({
          actorEmail: 'operator@yawp.test',
          keyId: 'writer',
          targetId: 'at-1',
          endpoint: `${method} /api/internal/v1/admin/assignment-types${path}`,
          requestHash: createHash('sha256')
            .update(body === undefined ? '' : JSON.stringify(body))
            .digest('hex'),
        });
      expect(audits[0].action).toBe(
        `${audits[1].action.replace(/\.after$/, '')}.before`
      );
      if (name !== 'create')
        expect(events.slice(0, 2)).toEqual(['lock', 'read']);
    });
    if (name !== 'create') {
      test(`${name}: invalid id 400 and absent type 404`, async () => {
        const { handlers, missing } = fixture();
        expect(
          (await invoke(handlers, name, request(method, path, body), '!'))
            .status
        ).toBe(400);
        missing();
        const result = await invoke(
          handlers,
          name,
          request(method, path, body)
        );
        expect(result.status).toBe(404);
        expect(await result.json()).toEqual({
          error: 'Assignment type not found',
        });
      });
    }
  }
  test.each([
    '{',
    '{}',
    '{"title":" "}',
    '{"title":"New","unknown":1}',
    '{"title":"New","allowsImageUploads":"true"}',
  ])('invalid create %s', async (raw) => {
    const { handlers, db } = fixture();
    expect(
      (await handlers.create(request('POST', '', undefined, { raw }))).status
    ).toBe(400);
    expect(db.assignmentType.create).not.toHaveBeenCalled();
  });
  test.each([
    '',
    '{}',
    '{',
    '{"unknown":true}',
    '{"title":""}',
    '{"rubricSelection":null}',
    '{"description":1}',
  ])('invalid patch %s', async (raw) => {
    const { handlers, db } = fixture();
    expect(
      (
        await handlers.update(
          request('PATCH', '/at-1', undefined, { raw }),
          'at-1'
        )
      ).status
    ).toBe(400);
    expect(db.assignmentType.update).not.toHaveBeenCalled();
  });
  test('create trims fields, chooses position and merges override', async () => {
    const { handlers, db } = fixture();
    await handlers.create(
      request('POST', '', {
        title: ' New ',
        tutorInstructions: '',
        gradingInstructionsOverride: ' Override ',
        allowsImageUploads: true,
      })
    );
    expect(db.assignmentType.create.mock.calls[0]?.[0].data).toMatchObject({
      title: 'New',
      kind: null,
      position: 4,
      tutorInstructions: null,
      allowsImageUploads: true,
      gradingPromptConfigJson: { gradingInstructionsOverride: 'Override' },
    });
  });
  test('partial patch preserves omitted fields, override changes bump once and removal preserves other config', async () => {
    const { handlers, db } = fixture();
    const result = await handlers.update(
      request('PATCH', '/at-1', {
        gradingInstructionsOverride: null,
        tutorInstructions: '',
        collaborationSupported: true,
      }),
      'at-1'
    );
    const value = (await result.json()).assignmentType;
    expect(value).toMatchObject({
      title: 'Writing',
      description: 'Keep me',
      tutorInstructions: null,
      gradingAssistantVersion: 4,
      collaborationSupported: true,
    });
    expect(
      db.assignmentType.update.mock.calls[0]?.[0].data.gradingPromptConfigJson
    ).toEqual({ keep: true });
    expect(db.assignmentType.update.mock.calls[0]?.[0].data).not.toHaveProperty(
      'title'
    );
    await handlers.update(
      request('PATCH', '/at-1', { gradingInstructionsOverride: '' }),
      'at-1'
    );
    expect(db.assignmentType.update.mock.calls[1]?.[0].data).not.toHaveProperty(
      'gradingAssistantVersion'
    );
  });
  test('same override does not bump', async () => {
    const { handlers, db } = fixture();
    await handlers.update(
      request('PATCH', '/at-1', { gradingInstructionsOverride: ' Old ' }),
      'at-1'
    );
    expect(db.assignmentType.update.mock.calls[0]?.[0].data).not.toHaveProperty(
      'gradingAssistantVersion'
    );
  });
  test('picker errors are returned for create and patch', async () => {
    const { handlers, db } = fixture();
    for (const [name, method, path, body] of [cases[0], cases[1]]) {
      const result = await invoke(
        handlers,
        name,
        request(method, path, { ...body, rubricSelection: 'missing' })
      );
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({
        error: 'That rubric no longer exists. Choose another rubric.',
      });
    }
    expect(db.assignmentType.create).not.toHaveBeenCalled();
    expect(db.assignmentType.update).not.toHaveBeenCalled();
  });
  test('create replay serializes by actor/key/idempotency and conflicting bytes return 409', async () => {
    const { handlers, db, audits } = fixture();
    const send = (title: string) =>
      handlers.create(
        request('POST', '', { title }, { idempotency: 'retry-1' })
      );
    expect((await send('New')).status).toBe(201);
    expect((await send('New')).status).toBe(200);
    expect(db.assignmentType.create).toHaveBeenCalledTimes(1);
    expect(audits).toHaveLength(2);
    expect(audits[1].metadata.idempotencyKey).toBe('retry-1');
    expect((await send('Different')).status).toBe(409);
    expect(String(db.$queryRaw.mock.calls[0]?.[0])).toContain(
      'pg_advisory_xact_lock'
    );
  });
  test('create replay uses the canonical endpoint for a trailing slash', async () => {
    const { handlers, db } = fixture();
    await handlers.create(
      request('POST', '/', { title: 'New' }, { idempotency: 'canonical' })
    );
    const result = await handlers.create(
      request('POST', '', { title: 'New' }, { idempotency: 'canonical' })
    );
    expect(result.status).toBe(200);
    expect(
      db.internalPlatformApiAudit.createMany.mock.calls[0]?.[0].data[1].endpoint
    ).toBe('POST /api/internal/v1/admin/assignment-types');
  });
  test('unreplayable create returns 409', async () => {
    const { handlers, missing } = fixture();
    await handlers.create(
      request('POST', '', { title: 'New' }, { idempotency: 'retry' })
    );
    missing();
    expect(
      (
        await handlers.create(
          request('POST', '', { title: 'New' }, { idempotency: 'retry' })
        )
      ).status
    ).toBe(409);
  });
  test('archive and restore are idempotent and audited each time', async () => {
    const { handlers, audits } = fixture();
    const first = (
      await (
        await handlers.archive(request('POST', '/at-1/archive'), 'at-1')
      ).json()
    ).assignmentType.archivedAt;
    const second = (
      await (
        await handlers.archive(request('POST', '/at-1/archive'), 'at-1')
      ).json()
    ).assignmentType.archivedAt;
    expect(first).toBeTruthy();
    expect(second).toBe(first);
    await handlers.restore(request('POST', '/at-1/restore'), 'at-1');
    const result = await handlers.restore(
      request('POST', '/at-1/restore'),
      'at-1'
    );
    expect((await result.json()).assignmentType.archivedAt).toBeNull();
    expect(audits).toHaveLength(8);
  });
  test.each([
    { ...image, contentType: 'image/jpeg' },
    { ...image, dataBase64: '!!!' },
    { ...image, dataBase64: '' },
    { ...image, extra: true },
    {
      contentType: 'image/gif',
      dataBase64: Buffer.from('c7c9c6b8b9e1', 'hex').toString('base64'),
    },
    {
      contentType: 'image/webp',
      dataBase64: Buffer.from('d2c9c6c604000000d7c5c2d0', 'hex').toString(
        'base64'
      ),
    },
  ])('invalid image', async (body) => {
    const { handlers, db } = fixture();
    expect(
      (await handlers.replaceImage(request('PUT', '/at-1/image', body), 'at-1'))
        .status
    ).toBe(400);
    expect(db.assignmentTypeImage.create).not.toHaveBeenCalled();
  });
  test.each([
    ['image/png', '89504e470d0a1a0a'],
    ['image/jpeg', 'ffd8ff'],
    ['image/gif', '474946383961'],
    ['image/webp', '524946460400000057454250'],
  ])('accepts the %s magic bytes', async (contentType, hex) => {
    const { handlers } = fixture();
    const result = await handlers.replaceImage(
      request('PUT', '/at-1/image', {
        contentType,
        dataBase64: Buffer.from(hex, 'hex').toString('base64'),
      }),
      'at-1'
    );
    expect(result.status).toBe(200);
  });
  test('accepts an image at exactly 5 MiB', async () => {
    const { handlers } = fixture();
    const blob = Buffer.alloc(5 * 1024 * 1024);
    png.copy(blob);
    expect(
      (
        await handlers.replaceImage(
          request('PUT', '/at-1/image', {
            ...image,
            dataBase64: blob.toString('base64'),
          }),
          'at-1'
        )
      ).status
    ).toBe(200);
  });
  test('HMAC binds the actual raw body', async () => {
    const { handlers, db } = fixture();
    const original = request('POST', '', { title: 'Signed' });
    const tampered = new Request(base, {
      method: 'POST',
      headers: original.headers,
      body: '{"title":"Altered"}',
    });
    expect((await handlers.create(tampered)).status).toBe(401);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  test('selects a live library rubric and clears the relationship without editing raw config', async () => {
    const { handlers, db } = fixture();
    db.rubric.findFirst.mockResolvedValue({
      id: 'rubric-live',
      name: 'live',
      schemaJson: { rubric: { categories: [{ key: 'quality' }] } },
    } as never);
    await handlers.update(
      request('PATCH', '/at-1', { rubricSelection: 'rubric-live' }),
      'at-1'
    );
    expect(db.assignmentType.update.mock.calls[0]?.[0].data).toEqual({
      rubricId: 'rubric-live',
    });
    await handlers.update(
      request('PATCH', '/at-1', { rubricSelection: '' }),
      'at-1'
    );
    expect(db.assignmentType.update.mock.calls[1]?.[0].data).toEqual({
      rubricId: null,
    });
  });
  for (const name of ['archive', 'restore', 'removeImage']) {
    test(`${name}: rejects unknown body fields and malformed JSON`, async () => {
      const { handlers, db } = fixture();
      const method = name === 'removeImage' ? 'DELETE' : 'POST';
      for (const raw of ['{', '{"unknown":true}'])
        expect(
          (
            await invoke(
              handlers,
              name,
              request(method, '/at-1', undefined, { raw })
            )
          ).status
        ).toBe(400);
      expect(db.$transaction).not.toHaveBeenCalled();
    });
  }
  test('image size limit is 5 MiB', async () => {
    const { handlers } = fixture();
    const body = {
      ...image,
      dataBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'),
    };
    expect(
      (await handlers.replaceImage(request('PUT', '/at-1/image', body), 'at-1'))
        .status
    ).toBe(413);
  });
  test('image replacement audits size/hash/type without binary or base64; removal is a no-op when absent', async () => {
    const { handlers, db, audits } = fixture();
    const result = await handlers.replaceImage(
      request('PUT', '/at-1/image', image),
      'at-1'
    );
    expect((await result.json()).assignmentType.image).toEqual({
      id: 'image-1',
      altText: 'Diagram',
      contentType: 'image/png',
    });
    expect(audits[1].metadata.after.image).toMatchObject({
      size: png.length,
      sha256: createHash('sha256').update(png).digest('hex'),
      contentType: 'image/png',
    });
    await handlers.removeImage(request('DELETE', '/at-1/image'), 'at-1');
    expect(audits[2].metadata.before.image.size).toBe(png.length);
    expect(JSON.stringify(audits)).not.toContain(image.dataBase64);
    expect(JSON.stringify(audits)).not.toContain('"blob"');
    expect(
      (await handlers.removeImage(request('DELETE', '/at-1/image'), 'at-1'))
        .status
    ).toBe(200);
    expect(db.assignmentTypeImage.deleteMany).toHaveBeenCalledTimes(3);
  });
});

describe('per-type selection and explicit override composition', () => {
  for (const name of ['create', 'update'] as const) {
    test(`${name}: applies override to the selected prompt config`, async () => {
      const { handlers, db } = fixture();
      const result = await invoke(
        handlers,
        name,
        request(
          name === 'create' ? 'POST' : 'PATCH',
          name === 'create' ? '' : '/at-1',
          {
            title: 'New',
            rubricSelection: 'assignment-type:source',
            gradingInstructionsOverride: ' Custom ',
          }
        )
      );
      expect(result.status).toBe(name === 'create' ? 201 : 200);
      expect(
        db.assignmentType[name === 'create' ? 'create' : 'update'].mock
          .calls[0]?.[0].data.gradingPromptConfigJson
      ).toEqual({
        ...source.gradingPromptConfigJson,
        gradingInstructionsOverride: 'Custom',
      });
      if (name === 'update')
        expect(
          (await result.json()).assignmentType.gradingAssistantVersion
        ).toBe(4);
    });
  }
  test.each([null, ''])(
    'explicit %s clears a copied override even if target has none',
    async (override) => {
      const initial = { ...row(), gradingPromptConfigJson: { keep: true } };
      const { handlers, db } = fixture(initial as ReturnType<typeof row>);
      const result = await handlers.update(
        request('PATCH', '/at-1', {
          rubricSelection: 'assignment-type:source',
          gradingInstructionsOverride: override,
        }),
        'at-1'
      );
      expect(result.status).toBe(200);
      expect(
        db.assignmentType.update.mock.calls[0]?.[0].data.gradingPromptConfigJson
      ).toEqual({
        systemInstructions: 'Selected system',
        gradingInstructions: 'Selected grading',
      });
      expect((await result.json()).assignmentType.gradingAssistantVersion).toBe(
        3
      );
    }
  );
  test('unchanged normalized override replaces source override without bumping', async () => {
    const { handlers, db } = fixture();
    const result = await handlers.update(
      request('PATCH', '/at-1', {
        rubricSelection: 'assignment-type:source',
        gradingInstructionsOverride: ' Old ',
      }),
      'at-1'
    );
    expect(result.status).toBe(200);
    expect(
      db.assignmentType.update.mock.calls[0]?.[0].data.gradingPromptConfigJson
    ).toEqual({
      ...source.gradingPromptConfigJson,
      gradingInstructionsOverride: 'Old',
    });
    expect((await result.json()).assignmentType.gradingAssistantVersion).toBe(
      3
    );
  });
  test('omission keeps the copied override and bumps when the final override changes', async () => {
    const { handlers, db } = fixture();
    const result = await handlers.update(
      request('PATCH', '/at-1', {
        rubricSelection: 'assignment-type:source',
      }),
      'at-1'
    );
    expect(result.status).toBe(200);
    expect(
      db.assignmentType.update.mock.calls[0]?.[0].data.gradingPromptConfigJson
    ).toEqual(source.gradingPromptConfigJson);
    expect((await result.json()).assignmentType.gradingAssistantVersion).toBe(
      4
    );
  });
});

describe('write reasons and bounded bodies', () => {
  for (const [name, method, path, body] of cases) {
    test(`${name}: trimmed reason in both audits, excluded from mutation and response`, async () => {
      const { handlers, db, audits } = fixture();
      const value = { ...body, reason: '  Correct catalog entry  ' };
      const result = await invoke(handlers, name, request(method, path, value));
      expect(result.status).toBe(name === 'create' ? 201 : 200);
      expect(audits).toHaveLength(2);
      for (const audit of audits) {
        expect(audit.metadata.reason).toBe('Correct catalog entry');
        expect(audit.requestHash).toBe(
          createHash('sha256').update(JSON.stringify(value)).digest('hex')
        );
      }
      for (const mutation of [
        db.assignmentType.create,
        db.assignmentType.update,
        db.assignmentTypeImage.create,
      ]) {
        for (const [args] of mutation.mock.calls)
          expect(args.data).not.toHaveProperty('reason');
      }
      expect((await result.json()).assignmentType).not.toHaveProperty('reason');
    });
    test(`${name}: absent reason is audited as null`, async () => {
      const { handlers, audits } = fixture();
      await invoke(handlers, name, request(method, path, body));
      expect(audits.map((audit) => audit.metadata.reason)).toEqual([
        null,
        null,
      ]);
    });
    test(`${name}: validates reason type and trimmed 1..500 length`, async () => {
      for (const reason of ['', '   ', 'r'.repeat(501), null, 1]) {
        const { handlers, db } = fixture();
        expect(
          (
            await invoke(
              handlers,
              name,
              request(method, path, { ...body, reason })
            )
          ).status
        ).toBe(400);
        expect(db.$transaction).not.toHaveBeenCalled();
      }
      const { handlers } = fixture();
      expect(
        (
          await invoke(
            handlers,
            name,
            request(method, path, { ...body, reason: ` ${'r'.repeat(500)} ` })
          )
        ).status
      ).toBe(name === 'create' ? 201 : 200);
    });
    test(`${name}: rejects declared and actual oversized bytes before authorization`, async () => {
      const limit = name === 'replaceImage' ? 8 * 1024 * 1024 : 256 * 1024;
      const authenticate = mock(async () => {
        throw new Error('must reject before authorization');
      });
      const { db } = fixture();
      const handlers = createInternalAssignmentTypeWriteHandlers({
        db: db as never,
        authenticate,
      });
      for (const unsigned of [true, false]) {
        for (const header of ['declared', 'understated', 'absent']) {
          const declared = header === 'declared';
          const req = request(method, path, undefined, {
            raw: declared ? '{}' : 'é'.repeat(limit / 2 + 1),
            unsigned,
          });
          if (declared) req.headers.set('content-length', String(limit + 1));
          // A lying Content-Length cannot bypass the actual streamed byte limit.
          else if (header === 'understated')
            req.headers.set('content-length', '2');
          const result = await invoke(handlers, name, req);
          expect(result.status).toBe(413);
          expect(await result.json()).toEqual({
            error: 'Request body too large',
          });
          expect(result.headers.get('cache-control')).toBe('no-store');
        }
      }
      expect(authenticate).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    });
    test(`${name}: accepts exactly the raw byte limit`, async () => {
      const limit = name === 'replaceImage' ? 8 * 1024 * 1024 : 256 * 1024;
      const json = JSON.stringify(body ?? {});
      const raw = json + ' '.repeat(limit - Buffer.byteLength(json));
      const req = request(method, path, undefined, { raw });
      req.headers.set('content-length', String(limit));
      const { handlers } = fixture();
      expect((await invoke(handlers, name, req)).status).toBe(
        name === 'create' ? 201 : 200
      );
    });
  }
  test('PATCH reason alone is still an invalid no-op', async () => {
    const { handlers, db } = fixture();
    expect(
      (
        await handlers.update(
          request('PATCH', '/at-1', { reason: 'Explain only' }),
          'at-1'
        )
      ).status
    ).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  test('reason is bound to the signature', async () => {
    const signed = request('POST', '', { title: 'New', reason: 'Original' });
    const tampered = new Request(base, {
      method: 'POST',
      headers: signed.headers,
      body: JSON.stringify({ title: 'New', reason: 'Altered' }),
    });
    expect((await fixture().handlers.create(tampered)).status).toBe(401);
  });
  for (const [field, limit] of [
    ['description', 5000],
    ['tutorInstructions', 50000],
    ['gradingInstructionsOverride', 20000],
  ] as const) {
    for (const name of ['create', 'update'] as const) {
      test(`${name}: ${field} accepts ${limit} and rejects ${limit + 1} characters`, async () => {
        for (const size of [limit, limit + 1]) {
          const { handlers } = fixture();
          const result = await invoke(
            handlers,
            name,
            request(
              name === 'create' ? 'POST' : 'PATCH',
              name === 'create' ? '' : '/at-1',
              { title: 'New', [field]: 'x'.repeat(size) }
            )
          );
          expect(result.status).toBe(
            size > limit ? 400 : name === 'create' ? 201 : 200
          );
        }
      });
    }
  }
  test('image altText accepts 300 and rejects 301 characters', async () => {
    for (const size of [300, 301]) {
      const { handlers } = fixture();
      expect(
        (
          await handlers.replaceImage(
            request('PUT', '/at-1/image', {
              ...image,
              altText: 'x'.repeat(size),
            }),
            'at-1'
          )
        ).status
      ).toBe(size > 300 ? 400 : 200);
    }
  });
});

test('streamed bodies count every chunk and cancel before reading the remainder', async () => {
  const { db } = fixture();
  const authenticate = mock(async () => {
    throw new Error('must reject before authorization');
  });
  const handlers = createInternalAssignmentTypeWriteHandlers({
    db: db as never,
    authenticate,
  });
  let pulls = 0;
  const cancel = mock(() => {});
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(128 * 1024));
      },
      cancel,
    },
    { highWaterMark: 0 }
  );
  const result = await handlers.create(
    new Request(base, {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit)
  );
  expect(result.status).toBe(413);
  expect(await result.json()).toEqual({ error: 'Request body too large' });
  expect(pulls).toBe(3);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(authenticate).not.toHaveBeenCalled();
});
