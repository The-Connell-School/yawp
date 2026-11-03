import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { prisma } from '~/utils/db.server';
import { recordBelowHsDecline } from './grade-gate.server';
import { redeemToken, releaseBatch, submitWaitlist } from './service.server';
import { decideApplication, reopenApplication } from '~/utils/internal-free-tier-http.server';
import { loader } from '~/routes/api.internal.v1.free-tier.grade-gate-declines/route';
import { signInternalApiRequest } from '~/utils/internal-platform-auth.server';

const enabled = process.env.GRADE_GATE_LOCAL_TEST === '1';
const local = enabled ? test : test.skip;
const prefix = `grade-gate-${Date.now()}`;
const flag = 'feature_flag.free_tier';
const baseFlag = 'feature_flag.free_tier';
const savedEnv = { ...process.env };
let savedFlags: any[] = [];
const input = (suffix: string) => ({ name: 'Test Teacher', email: `${prefix}-${suffix}@example.test`,
  schoolName: 'Demo', location: 'Here', gradeLevel: '7' });
async function v2(value: string) {
  await prisma.setting.upsert({ where: { name: flag }, create: { name: flag, value }, update: { value } });
}
beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !['ia-i4-declines', 'fto-free-page'].some(name => url.pathname.includes(name))) throw new Error('Dedicated I4 local database required');
  savedFlags = await prisma.setting.findMany({ where: { name: { in: [flag, baseFlag] } } });
  await prisma.setting.upsert({ where: { name: baseFlag }, create: { name: baseFlag, value: 'true' }, update: { value: 'true' } });
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'grade-db-test', secret: 'local-grade-gate-test-secret-32-characters', scopes: ['management:read'] }]);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
});
afterAll(async () => {
  if (!enabled) return;
  await prisma.freeTierApplication.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.acquisitionToken.deleteMany({ where: { label: { startsWith: prefix } } });
  for (const name of [flag, baseFlag]) {
    const old = savedFlags.find(row => row.name === name);
    if (old) await prisma.setting.update({ where: { name }, data: { value: old.value } });
    else await prisma.setting.deleteMany({ where: { name } });
  }
  for (const name of ['YAWP_INTERNAL_API_KEYS', 'INTERNAL_API_NONCE_STORE']) {
    if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name];
  }
  await prisma.$disconnect();
});
local('migration gives both preexisting and new rows an empty non-null tags array', async () => {
  const migration = await readFile(new URL('../../../../../packages/prisma/migrations/20261016190000_free_tier_application_tags/migration.sql', import.meta.url), 'utf8');
  await prisma.$transaction(async tx => {
    // Temp relation shadows the public table on this transaction's connection.
    // ON COMMIT DROP cleans it without touching the actual application table.
    await tx.$executeRawUnsafe('CREATE TEMPORARY TABLE "FreeTierApplication" (id TEXT PRIMARY KEY) ON COMMIT DROP');
    await tx.$executeRawUnsafe('INSERT INTO "FreeTierApplication" (id) VALUES (\'before\')');
    await tx.$executeRawUnsafe(migration);
    await tx.$executeRawUnsafe('INSERT INTO "FreeTierApplication" (id) VALUES (\'after\')');
    const rows = await tx.$queryRawUnsafe('SELECT id, tags FROM "FreeTierApplication" ORDER BY id');
    expect(rows).toEqual([{ id: 'after', tags: [] }, { id: 'before', tags: [] }]);
  });
});
local('default tags and tagged storage round-trip', async () => {
  await submitWaitlist(input('legacy'));
  const row = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: input('legacy').email } });
  expect(row.tags).toEqual([]);
  await prisma.freeTierApplication.update({ where: { id: row.id }, data: { tags: ['event', 'below-hs'] } });
  expect((await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: row.id } })).tags).toEqual(['event', 'below-hs']);
});
local('off and targeted v2 reject before persistence; invalid grades are not inferred', async () => {
  await v2('false');
  const result = await recordBelowHsDecline(input('off'));
  expect(result.status).toBe(409); expect(await result.json()).toEqual({ error: 'flag_off' });
  expect(await prisma.freeTierApplication.count({ where: { email: input('off').email } })).toBe(0);
  await v2(JSON.stringify({ mode: 'targeted', orgIds: ['example'] }));
  expect((await recordBelowHsDecline(input('off'))).status).toBe(409);
  await v2('true');
  expect((await recordBelowHsDecline({ ...input('invalid'), gradeLevel: '7th grade' })).status).toBe(400);
});
local('create-only concurrent and repeated declines preserve existing eligible records', async () => {
  await v2('true');
  const results = await Promise.all(Array.from({ length: 4 }, () => recordBelowHsDecline(input('repeat'))));
  for (const result of results) { expect(result.status).toBe(200); expect(await result.json()).toEqual({ ok: true }); }
  const row = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: input('repeat').email } });
  expect(row.status).toBe('REJECTED'); expect(row.tags).toEqual(['below-hs']); expect(row.releasedAt).toBeNull();
  await recordBelowHsDecline({ ...input('repeat'), email: '  ' + input('repeat').email.toUpperCase() + '  ', name: 'Changed' });
  expect(await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
  await submitWaitlist({ ...input('eligible'), gradeLevel: '11' });
  const before = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: input('eligible').email } });
  expect(await (await recordBelowHsDecline(input('eligible'))).json()).toEqual({ ok: true });
  expect(await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  expect((await recordBelowHsDecline({ ...input('repeat'), name: 'Changed', tags: ['malicious'] } as any)).status).toBe(400);
});
local('valid token provenance is recorded without uses, invalid tokens do not persist', async () => {
  await v2('true');
  const token = await prisma.acquisitionToken.create({ data: { label: prefix + '-event', tokenHash: prefix, code: prefix, bypassWaitlist: true, maxUses: 1 } });
  expect((await recordBelowHsDecline({ ...input('token'), token: token.code! })).status).toBe(200);
  const row = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: input('token').email } });
  expect(row.acquisitionTokenId).toBe(token.id);
  expect((await prisma.acquisitionToken.findUniqueOrThrow({ where: { id: token.id } })).uses).toBe(0);
  expect((await recordBelowHsDecline({ ...input('bad-token'), token: 'invalid' })).status).toBe(400);
  expect(await prisma.freeTierApplication.count({ where: { email: input('bad-token').email } })).toBe(0);
  await v2('false');
  // Stored declines remain inadmissible when v2 is disabled, with a generic successful response.
  expect(await redeemToken({ ...input('token'), token: token.code! })).toEqual({ ok: true, bypassWaitlist: false });
  expect((await prisma.acquisitionToken.findUniqueOrThrow({ where: { id: token.id } })).uses).toBe(0);
  expect((await releaseBatch({ applicationIds: [row.id] })).released).toBe(0);
  expect((await reopenApplication({ id: row.id, decidedByEmail: 'staff@example.test' })).status).toBe(409);
  expect((await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('REJECTED');
});
local('tag exclusions protect operator release and approval regardless of status', async () => {
  const row = await prisma.freeTierApplication.create({ data: { ...input('tagged-lead'), tags: ['below-hs', 'event'] } });
  expect((await releaseBatch({ applicationIds: [row.id] })).released).toBe(0);
  await prisma.freeTierApplication.update({ where: { id: row.id }, data: { status: 'MANUAL_REVIEW' } });
  expect((await decideApplication({ id: row.id, decision: 'APPROVED', decidedByEmail: 'staff@example.test' })).status).toBe(409);
  expect((await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('MANUAL_REVIEW');
});
local('concurrent decline and bypass admission never produce a partial or promoted decline', async () => {
  await v2('true');
  const token = await prisma.acquisitionToken.create({ data: { label: prefix + '-race', tokenHash: prefix + '-race', code: prefix + '-race', bypassWaitlist: true, maxUses: 1 } });
  const [decline, redemption] = await Promise.all([
    recordBelowHsDecline({ ...input('race'), token: token.code! }),
    redeemToken({ ...input('race'), gradeLevel: '11', token: token.code! }),
  ]);
  expect(decline.status).toBe(200);
  expect(redemption.ok).toBe(true);
  const row = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: input('race').email } });
  const uses = (await prisma.acquisitionToken.findUniqueOrThrow({ where: { id: token.id } })).uses;
  if (row.tags.includes('below-hs')) {
    expect(row.status).toBe('REJECTED'); expect(row.releasedAt).toBeNull(); expect(uses).toBe(0);
    expect(redemption).toEqual({ ok: true, bypassWaitlist: false });
  } else {
    expect(row.status).toBe('INVITED'); expect(row.releasedAt).not.toBeNull(); expect(uses).toBe(1);
  }
});
local('a queued decline wins over ordinary token redemption without consuming capacity', async () => {
  await v2('true');
  const token = await prisma.acquisitionToken.create({ data: {
    label: prefix + '-ordinary-race', tokenHash: prefix + '-ordinary-race',
    code: prefix + '-ordinary-race', bypassWaitlist: false, maxUses: 1,
  } });
  let unlock!: () => void;
  let locked!: (pid: number) => void;
  const gate = new Promise<void>(resolve => { unlock = resolve; });
  const ready = new Promise<number>(resolve => { locked = resolve; });
  const holder = prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_release'))`;
    const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    locked(row.pid);
    await gate;
  }, { timeout: 10000 });
  const pid = await ready;
  const blocked = async () => {
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE datname = current_database() AND ${pid} = ANY(pg_blocking_pids(pid))`;
    return row.count;
  };
  const waitUntil = async (condition: () => Promise<boolean>) => {
    const deadline = Date.now() + 3000;
    while (!(await condition())) {
      if (Date.now() > deadline) throw new Error('Expected database lock queue did not form');
      await Bun.sleep(10);
    }
  };
  let decline: Promise<Response> | undefined;
  let redemption: ReturnType<typeof redeemToken> | undefined;
  try {
    decline = recordBelowHsDecline({ ...input('ordinary-race'), token: token.code! });
    // Observe the decline waiting on the held lock before starting redemption.
    await waitUntil(async () => (await blocked()) === 1);
    let settled = false;
    redemption = redeemToken({ ...input('ordinary-race'), gradeLevel: '11', token: token.code! });
    void redemption.then(() => { settled = true; }, () => { settled = true; });
    // Before the fix redemption completes ahead of the queued decline. After
    // the fix both requests wait, with the decline first in the database queue.
    await waitUntil(async () => settled || (await blocked()) >= 2);
    unlock();
    await holder;
    expect((await decline).status).toBe(200);
    expect(await redemption).toEqual({ ok: true, bypassWaitlist: false });
    const row = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: input('ordinary-race').email } });
    expect(row.status).toBe('REJECTED');
    expect(row.tags).toEqual(['below-hs']);
    expect(row.releasedAt).toBeNull();
    expect(row.acquisitionTokenId).toBe(token.id);
    expect((await prisma.acquisitionToken.findUniqueOrThrow({ where: { id: token.id } })).uses).toBe(0);
  } finally {
    unlock();
    await Promise.allSettled([holder, decline, redemption]);
  }
}, 15000);
local('real query excludes untagged low grades, binds totals, and paginates equal timestamps', async () => {
  const createdAt = new Date('2026-10-16T12:00:00Z');
  await prisma.freeTierApplication.createMany({ data: ['a', 'b', 'c', 'untagged'].map(id => ({
    ...input('page-' + id), id: prefix + id, createdAt, tags: id === 'untagged' ? [] : ['below-hs'],
  })) });
  const read = async (query: string) => {
    const url = 'https://yawp.test/api/internal/v1/free-tier/grade-gate-declines' + query;
    const headers = signInternalApiRequest({ url, method: 'GET', keyId: 'grade-db-test', secret: 'local-grade-gate-test-secret-32-characters', actor: 'staff@example.test' }).headers;
    const response = await loader({ request: new Request(url, { headers }) } as any);
    expect(response.status).toBe(200); return response.json();
  };
  const query = `?q=${prefix}-page&from=2026-10-16&to=2026-10-17&limit=2`;
  const first = await read(query);
  expect(first.total).toBe(3); expect(first.items.map((row: any) => row.id)).toEqual([prefix + 'a', prefix + 'b']);
  const second = await read(query + '&cursor=' + first.nextCursor);
  expect(second.total).toBe(3); expect(second.items.map((row: any) => row.id)).toEqual([prefix + 'c']); expect(second.nextCursor).toBeNull();
  expect((await read(`?q=${prefix}-page&from=2026-10-17`)).total).toBe(0);
});
