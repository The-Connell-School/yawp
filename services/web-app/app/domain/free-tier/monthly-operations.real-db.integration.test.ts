import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { prisma as db } from '~/utils/db.server';
import {
  beginMonthlyOperation,
  finishMonthlyOperation,
  failMonthlyOperation,
  readMonthlyUsage,
} from './monthly-operations.server';
import { lessonPlanMonthWindow } from '~/utils/lesson-planner/lesson-planner-quota.server';
const enabled = process.env.FTO_LIMITS_DB_TESTS === '1';
if (
  enabled &&
  (!['127.0.0.1', 'localhost'].includes(
    new URL(process.env.DATABASE_URL!).hostname
  ) ||
    !(
      new URL(process.env.DATABASE_URL!).pathname.includes(
        'fto-limits-dashboard'
      ) ||
      (process.env.CI === 'true' &&
        new URL(process.env.DATABASE_URL!).pathname === '/yawp_migration_ci')
    ))
)
  throw new Error('Dedicated local task database required');
describe.skipIf(!enabled)(
  'durable monthly operations on isolated Postgres',
  () => {
    const org = `limits-${crypto.randomUUID()}`;
    const now = new Date('2026-10-31T23:59:59.999Z');
    const base = {
      organizationId: org,
      membershipId: 'teacher',
      feature: 'reporter' as const,
      cap: 2,
      now,
    };
    const begin = (key: string, changes = {}) =>
      beginMonthlyOperation({
        ...base,
        requestId: key,
        input: { message: key },
        ...changes,
      });
    let memberId: string;
    let userId: string;
    beforeAll(async () => {
      await db.organization.create({
        data: {
          id: org,
          name: 'Local monthly policy fixture',
          plan: 'FREE_CLASSROOM',
        },
      });
      const user = await db.user.create({
        data: { name: 'Local teacher', email: `${org}@example.test` },
      });
      userId = user.id;
      const member = await db.orgMembership.create({
        data: { organizationId: org, userId, role: 'TEACHER' },
      });
      memberId = member.id;
    });
    beforeEach(async () => {
      await db.lessonPlanConversation.deleteMany({
        where: { organizationId: org },
      });
      await db.setting.deleteMany({
        where: { name: { startsWith: `free_tier.monthly.v1:${org}:` } },
      });
    });
    afterAll(async () => {
      await db.setting.deleteMany({
        where: { name: { startsWith: `free_tier.monthly.v1:${org}:` } },
      });
      await db.lessonPlanConversation.deleteMany({
        where: { organizationId: org },
      });
      await db.orgMembership.deleteMany({ where: { organizationId: org } });
      await db.organization.deleteMany({ where: { id: org } });
      await db.user.deleteMany({ where: { id: userId } });
      await db.$disconnect();
    });
    test('LP includes earlier deleted I5 records and ledger-backed uses survive hard deletion without double counting', async () => {
      await db.lessonPlanConversation.create({
        data: {
          organizationId: org,
          membershipId: memberId,
          title: 'Earlier deleted draft',
          createdAt: now,
          deletedAt: now,
        },
      });
      await db.lessonPlanConversation.create({
        data: {
          organizationId: org,
          membershipId: memberId,
          title: 'Prior month',
          createdAt: new Date('2026-09-30T23:59:59.999Z'),
        },
      });
      expect(await readMonthlyUsage(org, 'lesson-planner', now)).toBe(1);
      const op = await begin('lp', {
        feature: 'lesson-planner',
        cap: 2,
        membershipId: memberId,
      });
      if (op.kind !== 'reserved') throw new Error('missing LP reservation');
      const conversation = await db.$transaction(async (tx) => {
        const conversation = await tx.lessonPlanConversation.create({
          data: {
            organizationId: org,
            membershipId: memberId,
            title: 'Metered draft',
            createdAt: now,
          },
        });
        await finishMonthlyOperation(tx, op, {
          conversationId: conversation.id,
        });
        return conversation;
      });
      expect(await readMonthlyUsage(org, 'lesson-planner', now)).toBe(2);
      await db.lessonPlanConversation.delete({
        where: { id: conversation.id },
      });
      expect(await readMonthlyUsage(org, 'lesson-planner', now)).toBe(2);
      expect(
        (
          await begin('lp-next', {
            feature: 'lesson-planner',
            cap: 2,
            membershipId: memberId,
          })
        ).kind
      ).toBe('exhausted');
    });
    test('UTC calendar boundaries are inclusive/exclusive including year rollover', () => {
      expect(lessonPlanMonthWindow(now)).toEqual({
        gte: new Date('2026-10-01T00:00:00Z'),
        lt: new Date('2026-11-01T00:00:00Z'),
      });
      expect(
        lessonPlanMonthWindow(new Date('2026-12-31T23:59:59Z')).lt.toISOString()
      ).toBe('2027-01-01T00:00:00.000Z');
    });
    test('atomic competing admission never exceeds cap', async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => begin(`race-${i}`))
      );
      expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(2);
      expect(results.filter((r) => r.kind === 'exhausted')).toHaveLength(4);
      expect(await readMonthlyUsage(org, 'reporter', now)).toBe(2);
    });
    test('duplicate in-flight request reserves once; saved success replays after cap lowered and rollover', async () => {
      const first = await begin('repeat');
      expect(first.kind).toBe('reserved');
      expect((await begin('repeat')).kind).toBe('pending');
      if (first.kind !== 'reserved') throw new Error('missing reservation');
      await db.$transaction((tx) =>
        finishMonthlyOperation(tx, first, {
          conversationId: 'report',
          reply: 'Saved reply',
        })
      );
      expect(
        await begin('repeat', { cap: 0, now: new Date('2026-11-01T00:00:00Z') })
      ).toMatchObject({ kind: 'replay', payload: { reply: 'Saved reply' } });
      expect(await readMonthlyUsage(org, 'reporter', now)).toBe(1);
      expect(
        await readMonthlyUsage(
          org,
          'reporter',
          new Date('2026-11-01T00:00:00Z')
        )
      ).toBe(0);
      expect(
        (await begin('repeat', { input: { message: 'changed' } })).kind
      ).toBe('conflict');
      expect(
        (await begin('repeat', { membershipId: 'someone-else' })).kind
      ).toBe('reserved');
    });
    test('known failure releases capacity, same request can retry without double charge', async () => {
      const first = await begin('failure', { cap: 1 });
      if (first.kind !== 'reserved') throw new Error('missing reservation');
      await failMonthlyOperation(first);
      expect(await readMonthlyUsage(org, 'reporter', now)).toBe(0);
      const retry = await begin('failure', { cap: 1 });
      expect(retry.kind).toBe('reserved');
      if (retry.kind !== 'reserved') throw new Error('missing retry');
      await db.$transaction((tx) =>
        finishMonthlyOperation(tx, retry, { reply: 'Success' })
      );
      expect(await readMonthlyUsage(org, 'reporter', now)).toBe(1);
      expect((await begin('next', { cap: 1 })).kind).toBe('exhausted');
    });
    test('zero/edited caps and reservation expiry fail closed against stale completion', async () => {
      expect((await begin('zero', { cap: 0 })).kind).toBe('exhausted');
      const first = await begin('slow', { cap: 1 });
      if (first.kind !== 'reserved') throw new Error('missing reservation');
      const later = new Date(+now + 360_000);
      expect(await readMonthlyUsage(org, 'reporter', later)).toBe(0);
      const retry = await begin('slow', { cap: 1, now: later });
      expect(retry.kind).toBe('reserved');
      await expect(
        db.$transaction((tx) =>
          finishMonthlyOperation(tx, first, { reply: 'stale' }, later)
        )
      ).rejects.toThrow();
      if (retry.kind !== 'reserved') throw new Error('missing reservation');
      await db.$transaction((tx) =>
        finishMonthlyOperation(tx, retry, { reply: 'current' }, later)
      );
      expect((await begin('slow', { now: later })).kind).toBe('replay');
    });
    test('successful use is durable independently of report deletion; transaction rollback releases no count', async () => {
      const first = await begin('durable');
      if (first.kind !== 'reserved') throw new Error('missing reservation');
      await expect(
        db.$transaction(async (tx) => {
          await finishMonthlyOperation(tx, first, {
            conversationId: 'deleted-later',
          });
          throw new Error('rollback');
        })
      ).rejects.toThrow('rollback');
      expect((await begin('durable')).kind).toBe('pending');
      await db.$transaction((tx) =>
        finishMonthlyOperation(tx, first, { conversationId: 'deleted-later' })
      );
      expect(await readMonthlyUsage(org, 'reporter', now)).toBe(1);
    });
  }
);
