import { afterAll, beforeAll, describe, expect, test, mock } from 'bun:test';
const transport = mock(async (_args: any) => ({ status: 'success' as const }));
mock.module('~/utils/email.server', () => ({ sendEmail: transport }));
import { prisma } from '~/utils/db.server';
import * as free from '~/routes/free._index/route';
import * as waitlist from '~/routes/api.free-tier.waitlist/route';
import * as token from '~/routes/api.free-tier.token/route';
import { hashToken, releaseBatch } from './service.server';
const local = process.env.FREE_WELCOME_DB_TESTS === '1' ? test : test.skip;
const prefix = `welcome-route-${Date.now()}`;
const flagName = 'feature_flag.free_tier';
const baseFlag = 'feature_flag.free_tier';
const paths = ['free', 'waitlist', 'token'] as const;
let saved: any[] = [];
let index = 0;
const input = (suffix: string, gradeLevel: unknown = '7') => ({ name: 'Teacher', email: `${prefix}-${suffix}@example.edu`, schoolName: 'Local High', location: 'Here', gradeLevel });
async function flag(value: string | null) {
  if (value === null) await prisma.setting.deleteMany({ where: { name: flagName } });
  else await prisma.setting.upsert({ where: { name: flagName }, create: { name: flagName, value }, update: { value } });
}
async function post(path: typeof paths[number], body: object) {
  // Local limiter is preserved; use distinct real local test identities.
  const headers = { 'content-type': path === 'free' ? 'application/x-www-form-urlencoded' : 'application/json', 'cf-connecting-ip': `198.51.100.${++index % 250 + 1}` };
  const request = new Request(`http://localhost/${path === 'free' ? 'free?index' : 'api/free-tier/' + path}`, {
    method: 'POST', headers, body: path === 'free' ? new URLSearchParams(body as Record<string, string>) : JSON.stringify(body),
  });
  const result = await ({ free, waitlist, token }[path]).action({ request } as never);
  return result instanceof Response ? { status: result.status, body: await result.json().catch(() => null) } : { status: 200, body: result };
}
async function fixture(suffix: string, override: object = {}) {
  const credential = prefix + suffix;
  return prisma.acquisitionToken.create({ data: { label: prefix + suffix, code: credential, tokenHash: hashToken(credential), bypassWaitlist: true, ...override } });
}
beforeAll(async () => {
  if (process.env.FREE_WELCOME_DB_TESTS !== '1') return;
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !(url.pathname.includes('fto-free-page') || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/yawp_migration_ci'))) throw new Error('Dedicated local welcome database required');
  saved = await prisma.setting.findMany({ where: { name: { in: [flagName, baseFlag] } } });
  await prisma.setting.upsert({ where: { name: baseFlag }, create: { name: baseFlag, value: 'true' }, update: { value: 'true' } });
  process.env.FREE_TIER_LINK_HMAC_SECRET = 'local-public-route-tests';
  process.env.PRIMARY_APP_URL = 'http://localhost:5241';
});
afterAll(async () => {
  if (process.env.FREE_WELCOME_DB_TESTS !== '1') return;
  await prisma.freeTierApplication.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.acquisitionToken.deleteMany({ where: { label: { startsWith: prefix } } });
  for (const name of [flagName, baseFlag]) {
    const old = saved.find(x => x.name === name);
    if (old) await prisma.setting.update({ where: { name }, data: { value: old.value } });
    else await prisma.setting.deleteMany({ where: { name } });
  }
  await prisma.$disconnect();
});
describe.serial('public decline by path', () => {
for (const path of paths) {
  local(`${path}: decline has no admission side effects, duplicates preserve first write and later eligible/off cannot admit`, async () => {
    await flag('true');
    const event = await fixture(path);
    const fields = { ...input(path), ...(path === 'waitlist' ? {} : { token: event.code!, intent: 'redeem' }) };
    // JSON token rejects unknown intent, while form owns it.
    if (path === 'token') delete (fields as any).intent;
    const first = await post(path, { ...fields, email: fields.email.toUpperCase() });
    expect(first.body).toEqual(path === 'free' ? { ok: true, declined: true } : { ok: true });
    const row = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: fields.email } });
    expect(row).toMatchObject({ status: 'REJECTED', tags: ['below-hs'], userId: null, organizationId: null, releasedAt: null, acquisitionTokenId: path === 'waitlist' ? null : event.id, releaseEmailCopyVersion: null });
    expect(await prisma.freeTierEmailLog.count({ where: { applicationId: row.id } })).toBe(0);
    expect(await prisma.freeTierAdminApproval.count({ where: { applicationId: row.id } })).toBe(0);
    expect(await prisma.freeTierSignedLink.count({ where: { applicationId: row.id } })).toBe(0);
    expect(await prisma.user.count({ where: { email: fields.email } })).toBe(0);
    const repeats = await Promise.all([post(path, { ...fields, name: 'Changed' }), post(path, fields)]);
    for (const repeat of repeats) expect(repeat.body).toEqual(first.body);
    const promotion = { ...fields, gradeLevel: '11' };
    expect((await post(path, promotion)).body.ok).toBe(true);
    await flag('false');
    expect((await post(path, promotion)).body.ok).toBe(true);
    expect(await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
    expect((await prisma.acquisitionToken.findUniqueOrThrow({ where: { id: event.id } })).uses).toBe(0);
    expect((await releaseBatch({ applicationIds: [row.id] })).released).toBe(0);
    expect(transport).not.toHaveBeenCalled();
  });
}
});
for (const path of paths) {
  local(`${path}: an existing eligible application remains unchanged under a decline submission`, async () => {
    await flag('true');
    const fields = input(path + '-existing');
    const row = await prisma.freeTierApplication.create({ data: { ...fields, gradeLevel: '11', status: 'INVITED', tags: ['existing'], releasedAt: new Date() } });
    const event = await fixture(path + '-existing');
    const body = { ...fields, ...(path === 'waitlist' ? {} : { token: event.code! }), ...(path === 'free' ? { intent: 'redeem' } : {}) };
    expect((await post(path, body)).body).toEqual(path === 'free' ? { ok: true, declined: true } : { ok: true });
    expect(await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
    expect((await prisma.acquisitionToken.findUniqueOrThrow({ where: { id: event.id } })).uses).toBe(0);
  });
}
for (const path of ['free', 'token'] as const) {
  for (const state of ['invalid', 'disabled', 'expired', 'full'] as const) local(`${path}: ${state} credential cannot persist a decline`, async () => {
    await flag('true');
    const event = await fixture(path + state, state === 'disabled' ? { disabledAt: new Date() } : state === 'expired' ? { expiresAt: new Date(0) } : state === 'full' ? { maxUses: 0 } : {});
    const fields = input(path + state);
    const result = await post(path, { ...fields, token: state === 'invalid' ? 'unknown-credential' : event.code!, ...(path === 'free' ? { intent: 'redeem' } : {}) });
    expect(result.body.ok).not.toBe(true);
    expect(await prisma.freeTierApplication.count({ where: { email: fields.email } })).toBe(0);
    expect((await prisma.acquisitionToken.findUniqueOrThrow({ where: { id: event.id } })).uses).toBe(0);
  });
}
local('organic first-write provenance stays organic after a later event decline', async () => {
  await flag('true');
  const fields = input('organic-first');
  await post('waitlist', fields);
  const row = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: fields.email } });
  const event = await fixture('later-event');
  await post('token', { ...fields, token: event.code! });
  expect(await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
});
