// Real-SQL tests for the free-tier domain. They need a migrated Postgres:
//   FREE_TIER_DB_TESTS=1 DATABASE_URL=postgresql://... bun test app/domain/free-tier
// CI runs them in the "Prisma migrations" job (see .github/workflows/ci.yml).
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

const enabled = process.env.FREE_TIER_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const svc = enabled ? await import('./service.server') : null;
const { prisma } = enabled ? await import('~/utils/db.server') : { prisma: null };
const run = Math.random().toString(36).slice(2, 8);

const person = (n: number | string, extra: Record<string, string> = {}) => ({
  name: `Teacher ${n}`,
  email: `ft-${run}-${n}@school.example`,
  schoolName: 'North Ridge High',
  location: 'Austin, TX',
  gradeLevel: '10',
  ...extra,
});

async function makeToken(opts: { bypassWaitlist?: boolean; maxUses?: number; expiresAt?: string } = {}) {
  const [{ token }] = await svc!.createAcquisitionTokens({ label: `t-${run}`, count: 1, bypassWaitlist: false, ...opts } as never);
  return token;
}

beforeEach(async () => {
  if (!enabled) return;
  await prisma!.freeTierApplication.deleteMany({ where: { email: { contains: `ft-${run}-` } } });
});
afterAll(async () => {
  if (!enabled) return;
  await prisma!.freeTierApplication.deleteMany({ where: { email: { contains: `ft-${run}-` } } });
  await prisma!.acquisitionToken.deleteMany({ where: { label: `t-${run}` } });
});

suite('waitlist', () => {
  test('creates a LEAD with a normalized email', async () => {
    await svc!.submitWaitlist({ ...person('a'), email: `  FT-${run}-A@School.Example ` });
    const row = await prisma!.freeTierApplication.findUnique({ where: { email: `ft-${run}-a@school.example` } });
    expect(row?.status).toBe('LEAD');
  });

  test('a resubmission never overwrites the existing applicant (no tampering) and does not throw', async () => {
    await svc!.submitWaitlist(person('b'));
    await svc!.submitWaitlist({ ...person('b'), name: 'Mallory', schoolName: 'Evil High' });
    const rows = await prisma!.freeTierApplication.findMany({ where: { email: `ft-${run}-b@school.example` } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Teacher b');
    expect(rows[0]!.schoolName).toBe('North Ridge High');
  });

  test('honeypot stores nothing', async () => {
    await svc!.submitWaitlist({ ...person('c'), middleName: 'bot' });
    expect(await prisma!.freeTierApplication.count({ where: { email: `ft-${run}-c@school.example` } })).toBe(0);
  });
});

suite('token redemption', () => {
  test('maxUses is exact under concurrency (10 people, 3 uses)', async () => {
    const token = await makeToken({ maxUses: 3 });
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => svc!.redeemToken({ ...person(`m${i}`), token })));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.reason === 'exhausted')).toHaveLength(7);
    const row = await prisma!.acquisitionToken.findUnique({ where: { tokenHash: svc!.hashToken(token) } });
    expect(row?.uses).toBe(3);
    expect(await prisma!.freeTierApplication.count({ where: { email: { contains: `ft-${run}-m` } } })).toBe(3);
  });

  test('the same person scanning twice uses the token once', async () => {
    const token = await makeToken({ maxUses: 2 });
    await svc!.redeemToken({ ...person('d'), token });
    await svc!.redeemToken({ ...person('d'), token });
    await svc!.redeemToken({ ...person('e'), token });
    const row = await prisma!.acquisitionToken.findUnique({ where: { tokenHash: svc!.hashToken(token) } });
    expect(row?.uses).toBe(2);
  });

  test('expired tokens are refused and not counted', async () => {
    const token = await makeToken({ expiresAt: new Date(Date.now() + 1500).toISOString() });
    await new Promise((r) => setTimeout(r, 1800));
    const result = await svc!.redeemToken({ ...person('f'), token });
    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(await prisma!.freeTierApplication.count({ where: { email: `ft-${run}-f@school.example` } })).toBe(0);
  });

  test('unknown token', async () => {
    expect(await svc!.redeemToken({ ...person('g'), token: 'nope' })).toEqual({ ok: false, reason: 'invalid' });
  });

  test('bypass token: new email -> INVITED+released; waitlisted LEAD -> INVITED; plain token -> LEAD', async () => {
    const bypass = await makeToken({ bypassWaitlist: true });
    const plain = await makeToken();
    await svc!.redeemToken({ ...person('h'), token: bypass });
    await svc!.submitWaitlist(person('i'));
    await svc!.redeemToken({ ...person('i'), token: bypass });
    await svc!.redeemToken({ ...person('j'), token: plain });
    const get = (n: string) => prisma!.freeTierApplication.findUnique({ where: { email: `ft-${run}-${n}@school.example` } });
    expect((await get('h'))?.status).toBe('INVITED');
    expect((await get('h'))?.releasedAt).not.toBeNull();
    expect((await get('i'))?.status).toBe('INVITED');
    expect((await get('j'))?.status).toBe('LEAD');
    expect((await get('j'))?.releasedAt).toBeNull();
  });

  test('a bypass token never moves an advanced application backwards or overwrites its details', async () => {
    const bypass = await makeToken({ bypassWaitlist: true });
    for (const status of ['ACCOUNT_CREATED', 'APPROVED', 'REJECTED'] as const) {
      const email = `ft-${run}-adv-${status}@school.example`;
      await prisma!.freeTierApplication.create({
        data: { email, name: 'Original', schoolName: 'Original High', location: 'X', gradeLevel: '9', status },
      });
      await svc!.redeemToken({ ...person(`adv-${status}`), name: 'Mallory', token: bypass });
      const row = await prisma!.freeTierApplication.findUnique({ where: { email } });
      expect(row?.status).toBe(status);
      expect(row?.name).toBe('Original');
    }
  });

  test('stored hash only; plaintext is not in the table', async () => {
    const token = await makeToken();
    const rows = await prisma!.$queryRawUnsafe<{ tokenHash: string }[]>(`SELECT "tokenHash" FROM "AcquisitionToken" WHERE "label" = $1`, `t-${run}`);
    expect(rows.every((r) => r.tokenHash !== token && r.tokenHash.length === 64)).toBe(true);
    expect(await svc!.checkTokenValidity(token)).toMatchObject({ valid: true });
  });
});

suite('release cap', () => {
  const ids = async (prefix: string, n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const row = await prisma!.freeTierApplication.create({ data: { ...person(`${prefix}${i}`), status: 'LEAD' } });
      out.push(row.id);
    }
    return out;
  };

  test('concurrent batches cannot exceed the cap', async () => {
    const before = await prisma!.freeTierApplication.count({
      where: { OR: [{ releasedAt: { not: null } }, { status: { not: 'LEAD' } }], NOT: { email: { contains: `ft-${run}-` } } },
    });
    const old = process.env.FREE_TIER_RELEASE_CAP;
    process.env.FREE_TIER_RELEASE_CAP = String(before + 5);
    try {
      const all = await ids('r', 12);
      const results = await Promise.all([
        svc!.releaseBatch({ applicationIds: all.slice(0, 4) }),
        svc!.releaseBatch({ applicationIds: all.slice(4, 8) }),
        svc!.releaseBatch({ applicationIds: all.slice(8, 12) }),
      ]);
      expect(results.reduce((n, r) => n + r.released, 0)).toBe(5);
      expect(await prisma!.freeTierApplication.count({ where: { email: { contains: `ft-${run}-r` }, status: 'INVITED' } })).toBe(5);
      expect(results.reduce((n, r) => n + r.refused, 0)).toBe(7);
    } finally {
      if (old === undefined) delete process.env.FREE_TIER_RELEASE_CAP;
      else process.env.FREE_TIER_RELEASE_CAP = old;
    }
  });

  test('already-released, unknown and duplicate ids do not use up headroom', async () => {
    const before = await prisma!.freeTierApplication.count({
      where: { OR: [{ releasedAt: { not: null } }, { status: { not: 'LEAD' } }], NOT: { email: { contains: `ft-${run}-` } } },
    });
    const old = process.env.FREE_TIER_RELEASE_CAP;
    process.env.FREE_TIER_RELEASE_CAP = String(before + 2);
    try {
      const [a, b, c] = await ids('s', 3);
      await svc!.releaseBatch({ applicationIds: [a!] });
      const again = await svc!.releaseBatch({ applicationIds: [a!, a!, 'missing', b!, c!] });
      expect(again).toMatchObject({ released: 1, refused: 1, skipped: 2 });
      const first = await prisma!.freeTierApplication.findUnique({ where: { id: a! } });
      expect(first?.status).toBe('INVITED');
    } finally {
      if (old === undefined) delete process.env.FREE_TIER_RELEASE_CAP;
      else process.env.FREE_TIER_RELEASE_CAP = old;
    }
  });
});
