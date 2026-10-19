import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
mock.module('~/utils/db.server', () => ({ prisma: {} }));
const { createInternalAssignmentTypeModuleHandlers } = await import('./internal-assignment-type-module-writes.server');
const { signInternalApiRequest, resetInternalApiMemoryNonceStore, resetInternalApiRateLimitBuckets } = await import('./internal-platform-auth.server');
const secret = 'module-write-test-secret-at-least-32';
const saved = { ...process.env };
const base = 'https://yawp.test/api/internal/v1/admin/assignment-types/at-1/modules';
function request(method: string, path = '', value?: unknown, options: any = {}) {
  const body = options.raw ?? (value === undefined ? '' : JSON.stringify(value));
  const headers: any = options.unsigned ? {} : options.legacy ? { authorization: `Bearer ${'x'.repeat(43)}` } : signInternalApiRequest({ method, url: base + path, body, keyId: options.keyId ?? 'writer', secret, actor: 'Operator@Yawp.test' }).headers;
  if (options.idempotency) headers['Idempotency-Key'] = options.idempotency;
  return new Request(base + path, { method, headers, ...(method !== 'GET' ? { body } : {}) });
}
function fixture() {
  let serial = 0;
  const modules: any[] = [{ id: 'm-1', assignmentTypeId: 'at-1', deletedAt: null, title: 'First', description: null, isSelfGuided: false, tutorInstructions: null, tutorInstructionsVariantsJson: null, rubricAlignmentJson: null, position: 4 }];
  const steps: any[] = [{ id: 's-1', assignmentModuleId: 'm-1', title: 'First step', prompt: 'Prompt', tutorInstructions: null, tutorInstructionsVariantsJson: null, showChatButton: false, showNextButton: true, position: 3, buttons: [] }];
  const audits: any[] = [];
  const events: string[] = [];
  const matches = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v);
  const ordered = (rows: any[]) => [...rows].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const hydrate = (m: any) => m ? { ...m, instructions: ordered(steps.filter(s => s.assignmentModuleId === m.id)).map(s => ({ ...s, buttons: ordered(s.buttons) })) } : null;
  function table(rows: any[], isModule: boolean) {
    return {
      count: mock(async ({ where }: any) => rows.filter(r => matches(r, where)).length),
      findFirst: mock(async ({ where }: any) => { events.push('read'); const row = rows.find(r => matches(r, where)); return isModule ? hydrate(row) : row ?? null; }),
      findMany: mock(async ({ where }: any) => ordered(rows.filter(r => matches(r, where))).map(r => isModule ? hydrate(r) : { ...r })),
      create: mock(async ({ data }: any) => {
        const { buttons, ...fields } = data;
        const row = { id: `new-${++serial}`, description: null, deletedAt: null, isSelfGuided: false, tutorInstructions: null, tutorInstructionsVariantsJson: null, rubricAlignmentJson: null, showChatButton: false, showNextButton: true, ...fields, buttons: buttons?.create ?? [] };
        rows.push(row); events.push('write'); return row;
      }),
      update: mock(async ({ where, data }: any) => {
        const row = rows.find(r => matches(r, where));
        const { buttons, ...fields } = data;
        Object.assign(row, fields);
        if (buttons) row.buttons = buttons.create;
        events.push('write'); return row;
      }),
      delete: mock(async ({ where }: any) => { const i = rows.findIndex(r => matches(r, where)); events.push('write'); return rows.splice(i, 1)[0]; }),
    };
  }
  const db: any = {
    assignmentType: { findUnique: mock(async ({ where }: any) => { events.push('type-read'); return where.id === 'at-1' ? { id: 'at-1' } : null; }) },
    assignmentModule: table(modules, true), assignmentModuleInstruction: table(steps, false),
    internalPlatformApiAudit: {
      findFirst: mock(async ({ where }: any) => audits.find(a => a.action === where.action && a.endpoint === where.endpoint && a.actorEmail === where.actorEmail && a.keyId === where.keyId && a.metadata.idempotencyKey === where.metadata.equals)),
      createMany: mock(async ({ data }: any) => { audits.push(...data); events.push('audit'); }),
    },
    $queryRaw: mock(async (strings: TemplateStringsArray) => { events.push(strings.join('').includes('AssignmentModule') ? 'module-lock' : 'type-lock'); return []; }),
    $transaction: mock(async (fn: any) => fn(db)),
  };
  const auditRead = mock(async (_event: any) => {});
  return { db, modules, steps, audits, events, auditRead, handlers: createInternalAssignmentTypeModuleHandlers({ db, auditRead }) };
}
beforeEach(() => {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'writer', secret, scopes: ['management:write', 'management:read'] }, { id: 'reader', secret, scopes: ['management:read'] }, { id: 'write-only', secret, scopes: ['management:write'] }]);
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'x'.repeat(43);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  resetInternalApiMemoryNonceStore(); resetInternalApiRateLimitBuckets();
});
afterEach(() => { for (const key of ['YAWP_INTERNAL_API_KEYS', 'YAWP_MANAGEMENT_SERVICE_KEY', 'INTERNAL_API_NONCE_STORE']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
const cases = [
  ['createModule', 'POST', '', { title: 'New' }],
  ['updateModule', 'PATCH', '/m-1', { description: 'Changed' }],
  ['deleteModule', 'DELETE', '/m-1', undefined],
  ['reorderModules', 'PUT', '/order', { moduleIds: ['m-1'] }],
  ['createStep', 'POST', '/m-1/steps', { title: 'New step', prompt: 'Do this' }],
  ['updateStep', 'PATCH', '/m-1/steps/s-1', { prompt: 'New prompt' }],
  ['deleteStep', 'DELETE', '/m-1/steps/s-1', undefined],
  ['reorderSteps', 'PUT', '/m-1/steps/order', { stepIds: ['s-1'] }],
] as const;
function invoke(f: ReturnType<typeof fixture>, name: string, req: Request, id = 'at-1', moduleId = 'm-1', stepId = 's-1') { return (f.handlers as any)[name](req, id, moduleId, stepId) as Promise<Response>; }
for (const [name, method, path, body] of cases) {
  test(`${name}: auth and method guards`, async () => {
    const f = fixture();
    for (const options of [{ unsigned: true }, { legacy: true }, { keyId: 'reader' }]) expect((await invoke(f, name, request(method, path, body, options))).status).toBe('keyId' in options ? 403 : 401);
    expect((await invoke(f, name, request('GET', path))).status).toBe(405);
    expect(f.db.$transaction).not.toHaveBeenCalled();
  });
  test(`${name}: strict validation and malformed JSON`, async () => {
    const f = fixture();
    expect((await invoke(f, name, request(method, path, { ...body, unknown: true }))).status).toBe(400);
    expect((await invoke(f, name, request(method, path, undefined, { raw: '{' }))).status).toBe(400);
    expect((await invoke(f, name, request(method, path, body), 'bad/id')).status).toBe(400);
    expect(f.db.$transaction).not.toHaveBeenCalled();
  });
  test(`${name}: missing assignment type`, async () => {
    const f = fixture(); const res = await invoke(f, name, request(method, path, body), 'missing');
    expect(res.status).toBe(404); expect(await res.json()).toEqual({ error: 'Assignment type not found' }); expect(f.audits).toHaveLength(0);
  });
  test(`${name}: happy path commits paired attributed snapshots after locks`, async () => {
    const f = fixture(); const res = await invoke(f, name, request(method, path, body));
    expect(res.status).toBe(name.startsWith('create') ? 201 : 200);
    expect(res.headers.get('cache-control')).toBe('no-store'); expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(f.db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'ReadCommitted' });
    expect(f.events.indexOf('type-lock')).toBeLessThan(f.events.indexOf('type-read'));
    if (name.includes('Step')) expect(f.events.indexOf('module-lock')).toBeLessThan(f.events.indexOf('read'));
    expect(f.audits.map(a => a.result)).toEqual(['before', 'after']);
    for (const a of f.audits) expect(a).toMatchObject({ actorEmail: 'operator@yawp.test', keyId: 'writer', endpoint: `${method} ${new URL(base + path).pathname}`, requestHash: createHash('sha256').update(body === undefined ? '' : JSON.stringify(body)).digest('hex') });
    expect(f.audits[0].metadata).toHaveProperty('before'); expect(f.audits[1].metadata).toHaveProperty('after');
    const json = await res.json();
    if (name.startsWith('delete')) expect(json).toEqual({ deleted: { id: name === 'deleteModule' ? 'm-1' : 's-1' } });
    else if (name === 'reorderModules') expect(json.modules.map((m: any) => m.id)).toEqual(['m-1']);
    else expect(json.module).toHaveProperty('instructions');
  });
  if (!['createModule', 'reorderModules'].includes(name)) for (const state of ['foreign', 'deleted', 'missing']) test(`${name}: rejects ${state} module`, async () => {
    const f = fixture(); if (state === 'foreign') f.modules[0].assignmentTypeId = 'other'; else if (state === 'deleted') f.modules[0].deletedAt = new Date(); else f.modules.length = 0;
    const res = await invoke(f, name, request(method, path, body)); expect(res.status).toBe(404); expect(await res.json()).toEqual({ error: 'Module not found' }); expect(f.audits).toHaveLength(0);
  });
}
for (const name of ['updateStep', 'deleteStep']) test(`${name}: rejects step belonging to another module`, async () => { const f = fixture(); f.steps[0].assignmentModuleId = 'other'; const res = await invoke(f, name, request(name === 'updateStep' ? 'PATCH' : 'DELETE', '/m-1/steps/s-1', name === 'updateStep' ? { title: 'Changed' } : undefined)); expect(res.status).toBe(404); expect(await res.json()).toEqual({ error: 'Step not found' }); });
test('partial patches preserve omitted fields; buttons replace the whole ordered list', async () => {
  const f = fixture();
  let res = await f.handlers.updateStep(request('PATCH', '/m-1/steps/s-1', { buttons: [{ label: 'Respond', action: 'response' }, { label: 'Next', action: 'advance' }] }), 'at-1', 'm-1', 's-1');
  expect(res.status).toBe(200); expect(f.steps[0]).toMatchObject({ title: 'First step', prompt: 'Prompt', buttons: [{ label: 'Respond', action: 'response', position: 0 }, { label: 'Next', action: 'advance', position: 1 }] });
  await f.handlers.updateStep(request('PATCH', '/m-1/steps/s-1', { buttons: [] }), 'at-1', 'm-1', 's-1'); expect(f.steps[0].buttons).toEqual([]);
  res = await f.handlers.updateModule(request('PATCH', '/m-1', { tutorInstructionsVariantsJson: { dbq: '  Guide  ', future: 'New', leq: '' }, rubricAlignmentJson: { thesis: 'primary' } }), 'at-1', 'm-1');
  expect(res.status).toBe(200); expect(f.modules[0]).toMatchObject({ title: 'First', position: 4, tutorInstructionsVariantsJson: { dbq: 'Guide', future: 'New' }, rubricAlignmentJson: { thesis: 'primary' } });
});
for (const [name, path, key] of [['reorderModules', '/order', 'moduleIds'], ['reorderSteps', '/m-1/steps/order', 'stepIds']]) for (const ids of [[], ['other'], ['m-1', 'm-1']]) test(`${name}: exact set rejects ${JSON.stringify(ids)}`, async () => { const f = fixture(); expect((await invoke(f, name, request('PUT', path, { [key]: ids }))).status).toBe(400); expect(f.audits).toHaveLength(0); });
for (const [name, path, body] of [['createModule', '', { title: 'Created' }], ['createStep', '/m-1/steps', { title: 'Created', prompt: 'Prompt' }]] as const) test(`${name}: idempotency replay and conflict, appended position`, async () => {
  const f = fixture(); const req = () => request('POST', path, body, { idempotency: ' retry ' });
  const initial = await invoke(f, name, req()); expect(initial.status).toBe(201);
  expect(name === 'createModule' ? f.modules[1].position : f.steps[1].position).toBe(name === 'createModule' ? 5 : 4);
  const replay = await invoke(f, name, req()); expect(replay.status).toBe(200); expect(await replay.json()).toEqual(await initial.json()); expect(f.audits).toHaveLength(2);
  expect((await invoke(f, name, request('POST', path, { ...body, title: 'Different' }, { idempotency: 'retry' }))).status).toBe(409);
  if (name === 'createModule') f.modules[1].deletedAt = new Date(); else f.steps.splice(1, 1);
  expect((await invoke(f, name, req())).status).toBe(409);
});
for (const [name, path, value] of [
  ['createModule', '', { title: '' }], ['updateModule', '/m-1', {}], ['updateModule', '/m-1', { rubricAlignmentJson: { x: 'invalid' } }], ['updateModule', '/m-1', { isSelfGuided: 'true' }], ['updateModule', '/m-1', { tutorInstructionsVariantsJson: { dbq: 3 } }],
  ['createStep', '/m-1/steps', { title: 'Step' }], ['updateStep', '/m-1/steps/s-1', {}], ['updateStep', '/m-1/steps/s-1', { buttons: [{ label: 'Go', action: 'invalid' }] }], ['updateStep', '/m-1/steps/s-1', { answerKey: 'unsupported' }], ['updateStep', '/m-1/steps/s-1', { nextButtonLabel: 'unsupported' }],
] as const) test(`${name}: rejects invalid fields ${JSON.stringify(value)}`, async () => { const f = fixture(); expect((await invoke(f, name, request(name.startsWith('create') ? 'POST' : 'PATCH', path, value))).status).toBe(400); });
test('full module GET uses read scope, ownership checks and existing read audit shape', async () => {
  const f = fixture(); const res = await f.handlers.detail(request('GET', '/m-1', undefined, { keyId: 'reader' }), 'at-1', 'm-1');
  expect(res.status).toBe(200); expect((await res.json()).module).toMatchObject({ id: 'm-1', instructionCount: 1, instructions: [{ id: 's-1', prompt: 'Prompt', buttonCount: 0, buttons: [] }] });
  expect(f.auditRead.mock.calls[0][0]).toMatchObject({ actorEmail: 'operator@yawp.test', keyId: 'reader', endpoint: 'GET /api/internal/v1/admin/assignment-types/at-1/modules/m-1', result: 'assignment-types.module.detail.success' });
  expect((await f.handlers.detail(request('GET', '/m-1', undefined, { keyId: 'write-only' }), 'at-1', 'm-1')).status).toBe(403);
  expect((await f.handlers.detail(request('GET', '/m-1', undefined, { unsigned: true }), 'at-1', 'm-1')).status).toBe(401);
  expect((await f.handlers.detail(request('POST', '/m-1'), 'at-1', 'm-1')).status).toBe(405);
  f.modules[0].deletedAt = new Date(); expect((await f.handlers.detail(request('GET', '/m-1'), 'at-1', 'm-1')).status).toBe(404);
});
