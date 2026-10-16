import { expect, test } from 'bun:test';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
const local = process.env.GUIDED_TOURS_LOCAL_TEST === '1';
(local ? test : test.skip)('UserTour has both enabled audit triggers after fresh migrations', async () => {
  const url = new URL(process.env.DATABASE_URL!);
  expect(['127.0.0.1', 'localhost']).toContain(url.hostname);
  expect(url.pathname.startsWith('/yawp_')).toBe(true);
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    const result = await db.query(`SELECT tgname, tgtype::int, tgfoid::regproc::text AS function, tgenabled
      FROM pg_trigger WHERE tgrelid='"UserTour"'::regclass AND NOT tgisinternal ORDER BY tgname`);
    expect(result.rows).toEqual([
      { tgname: 'internal_impersonation_mutation_audit', tgtype: 29, function: 'internal_impersonation_mutation_audit', tgenabled: 'O' },
      { tgname: 'internal_impersonation_truncate_guard', tgtype: 34, function: 'internal_impersonation_truncate_guard', tgenabled: 'O' },
    ]);
    // Exercise the upgrade sequence on an isolated transaction, then restore it.
    await db.query('BEGIN');
    await db.query('DROP TRIGGER internal_impersonation_mutation_audit ON "UserTour"; DROP TRIGGER internal_impersonation_truncate_guard ON "UserTour"');
    const sql = readFileSync(new URL('../../../../../packages/prisma/migrations/20261016230000_user_tour_impersonation_audit/migration.sql', import.meta.url), 'utf8');
    await db.query(sql);
    const repaired = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM pg_trigger WHERE tgrelid=\'"UserTour"\'::regclass AND NOT tgisinternal');
    expect(repaired.rows[0].count).toBe(2);
    await db.query('ROLLBACK');
  } finally { await db.end(); }
});

(local ? test : test.skip)('concurrent finishes and skips never lose completed progress', async () => {
  const { prisma } = await import('~/utils/db.server');
  const { recordTourOutcome } = await import('./guided-tours.server');
  const user = await prisma.user.create({ data: {} });
  try {
    for (let round = 0; round < 12; round++) {
      await prisma.userTour.deleteMany({ where: { userId: user.id } });
      const outcomes = round % 2 ? ['dismissed', 'completed'] as const : ['completed', 'dismissed'] as const;
      await Promise.all(outcomes.map((outcome) => recordTourOutcome(user.id, 'dashboard', outcome)));
      await recordTourOutcome(user.id, 'dashboard', 'dismissed');
      const stored = await prisma.userTour.findUniqueOrThrow({
        where: { userId_tourId: { userId: user.id, tourId: 'dashboard' } },
      });
      expect(stored.status).toBe('completed');
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
