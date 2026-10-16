import { afterAll, beforeAll, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { recordBelowHsDecline } from './grade-gate.server';
import { redeemToken, releaseBatch, submitWaitlist } from './service.server';
import { reopenApplication } from '~/utils/internal-free-tier-http.server';
import { loader } from '~/routes/api.internal.v1.free-tier.grade-gate-declines/route';
import { signInternalApiRequest } from '~/utils/internal-platform-auth.server';

const enabled = process.env.GRADE_GATE_LOCAL_TEST === '1';
const local = enabled ? test : test.skip;
const prefix = `grade-gate-${Date.now()}`;
const flag = 'feature_flag.free-tier-onboarding-v2';
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
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.includes('ia-i4-declines')) throw new Error('Dedicated I4 local database required');
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
local('additive default is empty for existing applications and tags round-trip', async () => {
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
