// Public route behaviour: uniform responses, honeypot, size limits, shared limiter.
//   FREE_TIER_DB_TESTS=1 DATABASE_URL=... bun test app/routes/api.free-tier
import { describe, expect, test } from 'bun:test';
import { CLOUDFRONT_IPV4_RANGES } from '~/utils/cloudfront-ranges.server';

const enabled = process.env.FREE_TIER_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const wl = enabled ? await import('./route') : null;
const tk = enabled ? await import('../api.free-tier.token/route') : null;
const svc = enabled ? await import('~/domain/free-tier/service.server') : null;
const { prisma } = enabled ? await import('~/utils/db.server') : { prisma: null };
const run = Math.random().toString(36).slice(2, 8);
const EDGE = CLOUDFRONT_IPV4_RANGES[0]!.split('/')[0]!.replace(/\d+$/, (n) => String(Number(n) + 1));

let ipCounter = 0;
const freshIp = () => `198.51.${100 + Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
const body = (n: string, extra: object = {}) => ({
  name: 'Ada Lovelace', email: `ft-${run}-${n}@school.example`, schoolName: 'North Ridge High', location: 'Austin, TX', gradeLevel: '10', ...extra,
});
const post = (b: unknown, opts: { ip?: string; type?: string; raw?: string } = {}) =>
  new Request('https://yawp.school/api/free-tier/waitlist', {
    method: 'POST',
    headers: { 'content-type': opts.type ?? 'application/json', 'x-forwarded-for': `${opts.ip ?? freshIp()}, ${EDGE}` },
    body: opts.raw ?? JSON.stringify(b),
  });
const call = (r: Request) => wl!.action({ request: r, params: {}, context: {} } as never) as Promise<Response>;

suite('POST /api/free-tier/waitlist', () => {
  test('new, duplicate and honeypot submissions are indistinguishable', async () => {
    const fresh = await call(post(body('u1')));
    const dup = await call(post(body('u1')));
    const trap = await call(post(body('u2', { middleName: 'bot' })));
    for (const r of [fresh, dup, trap]) {
      expect(r.status).toBe(200);
    }
    const texts = await Promise.all([fresh.text(), dup.text(), trap.text()]);
    expect(new Set(texts).size).toBe(1);
    expect(texts[0]).toBe('{"ok":true}');
    expect(await prisma!.freeTierApplication.count({ where: { email: `ft-${run}-u1@school.example` } })).toBe(1);
    expect(await prisma!.freeTierApplication.count({ where: { email: `ft-${run}-u2@school.example` } })).toBe(0);
  });

  test('rejects wrong content type, malformed JSON, oversize body and bad fields', async () => {
    expect((await call(post(body('v'), { type: 'text/plain' }))).status).toBe(400);
    expect((await call(post(null, { raw: '{nope' }))).status).toBe(400);
    expect((await call(post(null, { raw: JSON.stringify({ ...body('v'), name: 'x'.repeat(6000) }) }))).status).toBe(413);
    expect((await call(post(null, { raw: '[]' }))).status).toBe(400);
    expect((await call(post(body('v', { email: 'not-an-email' })))).status).toBe(400);
    expect((await call(post(body('v', { surprise: 1 })))).status).toBe(400);
    expect((await call(new Request('https://yawp.school/api/free-tier/waitlist', { method: 'PUT' }))).status).toBe(405);
  });

  test('the shared limiter applies: 7th request for one email is 429 with Retry-After, from different IPs', async () => {
    const statuses: number[] = [];
    let last: Response | null = null;
    for (let i = 0; i < 8; i++) {
      last = await call(post(body('w')));
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 6).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(6)).toEqual([429, 429]);
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  test('spoofed X-Forwarded-For prefixes do not mint new per-IP identities', async () => {
    // Same real viewer behind CloudFront, fresh forged prefix each time: the
    // per-IP minute budget (60) is shared, so the 61st+ request is limited.
    const viewer = freshIp();
    let limited = 0;
    for (let i = 0; i < 70; i++) {
      const r = await call(new Request('https://yawp.school/api/free-tier/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `9.9.${i}.1, ${viewer}, ${EDGE}` },
        body: JSON.stringify(body(`sp${i}`)),
      }));
      if (r.status === 429) limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
  });
});

suite('/api/free-tier/token', () => {
  const tpost = (b: object, ip = freshIp()) =>
    tk!.action({
      request: new Request('https://yawp.school/api/free-tier/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, ${EDGE}` },
        body: JSON.stringify(b),
      }),
      params: {}, context: {},
    } as never) as Promise<Response>;

  test('success reveals nothing about the application; new and existing emails look the same', async () => {
    const [{ token }] = await svc!.createAcquisitionTokens({ label: `rt-${run}`, count: 1, bypassWaitlist: true } as never);
    await svc!.submitWaitlist({ name: 'Existing', email: `ft-${run}-x1@school.example`, schoolName: 'S', location: 'L', gradeLevel: '9' });
    const a = await (await tpost({ ...body('x1'), token })).json();
    const b = await (await tpost({ ...body('x2'), token })).json();
    expect(a).toEqual({ ok: true, bypassWaitlist: true });
    expect(b).toEqual(a);
    expect(JSON.stringify(a)).not.toMatch(/status|applicationId|id"/);
  });

  test('bad token statuses and the GET validator', async () => {
    const res = await tpost({ ...body('x3'), token: 'does-not-exist' });
    expect(res.status).toBe(404);
    const get = (t: string) => tk!.loader({ request: new Request(`https://yawp.school/api/free-tier/token?token=${t}`, { headers: { 'x-forwarded-for': `${freshIp()}, ${EDGE}` } }), params: {}, context: {} } as never) as Promise<Response>;
    expect((await get('nope')).status).toBe(404);
    expect((await get('')).status).toBe(400);
  });
});

if (enabled) {
  const { afterAll } = await import('bun:test');
  afterAll(async () => {
    await prisma!.freeTierApplication.deleteMany({ where: { email: { contains: `ft-${run}-` } } });
    await prisma!.acquisitionToken.deleteMany({ where: { label: `rt-${run}` } });
  });
}
