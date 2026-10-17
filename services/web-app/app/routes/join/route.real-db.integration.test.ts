import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { loader, action } from './route';

const local = process.env.SIGNON_LOCAL_TEST === '1';
const suite = local ? test : test.skip;
const id = `join-route-${Date.now()}`;
const ip = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const flag = 'feature_flag.unified-sign-on';
const token = `${id}-private`;
const args = (request: Request) => ({ request, params: {}, context: {} }) as any;
const request = (query: string) => new Request(`http://localhost:5268/join${query}`, {
  headers: { 'x-forwarded-for': ip },
});
async function enabled(value: boolean) {
  await prisma.setting.upsert({ where: { name: flag }, update: { value: String(value) }, create: { name: flag, value: String(value), valueType: 'boolean' } });
}
beforeAll(async () => {
  if (!local) return;
  if (!['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw Error('Local database only');
  await prisma.organization.create({ data: { id, name: 'Join fixture', plan: 'FREE_CLASSROOM' } });
  await prisma.school.create({ data: { id, name: 'Join fixture', code: id, organizationId: id } });
  await prisma.class.create({ data: { id, code: id, schoolId: id, studentJoinToken: token } });
});
afterAll(async () => {
  if (!local) return;
  await prisma.signonFlow.deleteMany({});
  await prisma.class.delete({ where: { id } });
  await prisma.school.delete({ where: { id } });
  await prisma.organization.delete({ where: { id } });
  await prisma.setting.deleteMany({ where: { name: flag } });
  await prisma.$disconnect();
});
beforeEach(async () => {
  if (local) await prisma.class.update({ where: { id }, data: { studentJoinToken: token, isArchived: false } });
});
suite('real loader distinguishes rejected supplied tokens from missing/blank, only with flag on', async () => {
  for (const on of [true, false]) {
    await enabled(on);
    for (const query of ['', '?t=', '?t=%20%20']) {
      expect(await loader(args(request(query)))).toEqual({ joinToken: null, klass: null });
    }
    const result = await loader(args(request('?t=invalid&screen=class-handle&classId=' + id)));
    expect(result).toEqual(on
      ? { joinToken: null, klass: null, invalidLink: true }
      : { joinToken: 'invalid', klass: null });
  }
});
suite('real token lookup rejects rotated and archived invitations', async () => {
  await enabled(true);
  await prisma.class.update({ where: { id }, data: { studentJoinToken: `${token}-rotated` } });
  expect(await loader(args(request(`?t=${token}`)))).toEqual({ joinToken: null, klass: null, invalidLink: true });
  await prisma.class.update({ where: { id }, data: { studentJoinToken: token, isArchived: true } });
  expect(await loader(args(request(`?t=${token}`)))).toEqual({ joinToken: null, klass: null, invalidLink: true });
  await prisma.class.update({ where: { id }, data: { isArchived: false } });
});
suite('valid token retains legacy class context and unified trusted continuation', async () => {
  await enabled(false);
  expect(await loader(args(request(`?t=${token}`)))).toMatchObject({ joinToken: token, klass: { id } });
  await enabled(true);
  try {
    await loader(args(request(`?t=${token}`)));
    throw Error('Expected redirect');
  } catch (response) {
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get('location')).toBe('/auth/login?continue=1');
    expect((response as Response).headers.get('set-cookie')).toBeTruthy();
  }
});
suite('forged supplied token or class mismatch cannot create an account or session', async () => {
  const before = await Promise.all([prisma.user.count(), prisma.orgMembership.count(), prisma.session.count()]);
  for (const on of [true, false]) {
    await enabled(on);
    for (const [joinToken, classId] of [['invalid', id], [token, 'forged-class']]) {
      const result = await action(args(new Request('http://localhost:5268/join', {
        method: 'POST', headers: { origin: 'http://localhost:5268', 'x-forwarded-for': ip },
        body: new URLSearchParams({ name: 'Local Student', username: `local${Date.now()}`, password: 'local-pass-123', confirmPassword: 'local-pass-123', joinToken, classId }),
      })));
      expect(JSON.stringify(result)).toContain('Class not found.');
    }
  }
  expect(await Promise.all([prisma.user.count(), prisma.orgMembership.count(), prisma.session.count()])).toEqual(before);
});
suite('lookup throttling still applies before invalid-link presentation', async () => {
  await enabled(true);
  let throttled = false;
  for (let attempt = 0; attempt < 65; attempt++) {
    try {
      await loader(args(new Request('http://localhost:5268/join?t=invalid', {
        headers: { 'x-forwarded-for': ip },
      })));
    } catch (response) {
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(429);
      expect(Number((response as Response).headers.get('retry-after'))).toBeGreaterThan(0);
      throttled = true;
      break;
    }
  }
  expect(throttled).toBe(true);
});
