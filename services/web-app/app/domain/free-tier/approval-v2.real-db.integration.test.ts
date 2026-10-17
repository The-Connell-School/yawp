import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
const send = mock(
  async (_: any): Promise<any> => ({
    status: 'success',
    data: { id: 'captured' },
  })
);
mock.module('~/utils/email.server', () => ({ sendEmail: send }));
mock.module('./approval-hooks.server', () => ({
  ensureFreeTierProductionApprovalHooks: async () => {},
  getApprovalHooks: () => ({
    onApplicationApproved: async () => {},
    onApplicationRejected: async () => {},
  }),
}));
const enabled = process.env.APPROVAL_V2_DB_TESTS === '1';
describe.skipIf(!enabled)('approval v2 durable lifecycle', () => {
  let db: typeof import('~/utils/db.server').prisma;
  let api: typeof import('./approval-v2.server');
  const ids: string[] = [];
  const organizationId = `approval-suite-${crypto.randomUUID()}`;
  const now = new Date('2026-10-14T15:02:00Z');
  async function flag(mode = 'targeted', orgIds = [organizationId]) {
    await db.setting.upsert({
      where: { name: 'feature_flag.free-tier-onboarding-v2' },
      create: {
        name: 'feature_flag.free-tier-onboarding-v2',
        value: JSON.stringify({ mode, orgIds }),
      },
      update: { value: JSON.stringify({ mode, orgIds }) },
    });
  }
  async function fixture() {
    const app = await db.freeTierApplication.create({
      data: {
        name: 'Ms. Okafor',
        email: `approval-${crypto.randomUUID()}@example.org`,
        schoolName: 'Lincoln High',
        location: 'Local',
        gradeLevel: '11',
        userId: 'approval-test-user',
        organizationId,
        status: 'SENT',
      },
    });
    ids.push(app.id);
    const approval = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app.id,
        createdAt: new Date(+now - 1000),
        adminName: 'Dr. Patel',
        adminEmail: 'patel+approval@example.org',
        emailCopyVersionHash: 'test',
        firstSentAt: now,
        nextAutoReminderAt: new Date(+now + api.WEEK_MS),
        nextTeacherFollowUpAt: new Date(+now + api.WEEK_MS),
      },
    });
    return { app, approval };
  }
  beforeEach(async () => {
    db = (await import('~/utils/db.server')).prisma;
    api = await import('./approval-v2.server');
    await db.freeTierApplication.deleteMany({ where: { id: { in: ids } } });
    ids.length = 0;
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'local-approval-v2-test-secret';
    process.env.PRIMARY_APP_URL = 'http://localhost:5199';
    send.mockClear();
    send.mockImplementation(async () => ({
      status: 'success',
      data: { id: 'captured' },
    }));
    await flag();
  });
  afterAll(async () => {
    if (db) {
      await db.freeTierApplication.deleteMany({ where: { id: { in: ids } } });
      await flag('off');
      await db.$disconnect();
    }
    mock.restore();
  });
  test('before and at seven days, repeated/concurrent runs, four shared resends, teacher follow-up stop policy', async () => {
    const { app, approval } = await fixture();
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS - 1));
    expect(send).toHaveBeenCalledTimes(0);
    for (let week = 1; week <= 5; week++) {
      const clock = new Date(+now + week * api.WEEK_MS);
      await Promise.all([
        api.runApprovalJobs(clock),
        api.runApprovalJobs(clock),
      ]);
      await api.runApprovalJobs(clock);
    }
    const row = await db.freeTierAdminApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(row.reminderCount).toBe(4);
    expect(row.teacherFollowUpCount).toBe(5);
    expect(row.stopReason).toBe('max_reached');
    expect(row.needsManualFollowUp).toBe(true);
    expect(send).toHaveBeenCalledTimes(9);
    await db.freeTierApplication.update({
      where: { id: app.id },
      data: { status: 'APPROVED' },
    });
    await api.runApprovalJobs(new Date(+now + 6 * api.WEEK_MS));
    expect(send).toHaveBeenCalledTimes(9);
  });
  test('manual resends count and do not move weekly cadence; ten minute cooldown', async () => {
    const { app, approval } = await fixture();
    const clock = new Date(+now + 1000);
    const result = await api.queueManualApprovalReminder({
      applicationId: app.id,
      idempotencyKey: 'manual-1',
      now: clock,
    });
    expect(result.ok).toBe(true);
    await api.runApprovalJobs(clock);
    const row = await db.freeTierAdminApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(row.reminderCount).toBe(1);
    expect(row.lastReminderSource).toBe('manual');
    expect(row.nextAutoReminderAt?.getTime()).toBe(+now + api.WEEK_MS);
    expect(
      (
        await api.queueManualApprovalReminder({
          applicationId: app.id,
          idempotencyKey: 'manual-2',
          now: clock,
        })
      ).ok
    ).toBe(false);
  });
  test('forward validates owner and fields, supersedes old links and persists chain plus notification', async () => {
    const { app, approval } = await fixture();
    const { mintSignedLink, peekSignedLink } =
      await import('./signed-link.server');
    const old = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval.id },
      data: { signedLinkId: old.linkId },
    });
    const input = {
      applicationId: app.id,
      userId: 'approval-test-user',
      currentApprovalId: approval.id,
      newAdminName: 'Ms. Rivera',
      newAdminEmail: 'rivera@example.org',
      request: new Request('http://localhost/test'),
    };
    expect(
      (await api.forwardApprovalRequest({ ...input, userId: 'someone-else' }))
        .ok
    ).toBe(false);
    expect(
      (
        await api.forwardApprovalRequest({
          ...input,
          newAdminName: ' ',
          newAdminEmail: 'bad',
        })
      ).ok
    ).toBe(false);
    expect((await api.forwardApprovalRequest(input)).ok).toBe(true);
    expect((await api.forwardApprovalRequest(input)).ok).toBe(false);
    expect(
      (
        await peekSignedLink({
          token: old.token,
          expectedPurpose: 'ADMIN_APPROVE',
        })
      ).ok
    ).toBe(false);
    const next = await db.freeTierAdminApproval.findFirstOrThrow({
      where: { applicationId: app.id, status: 'PENDING' },
    });
    expect(next.redirectedFromId).toBe(approval.id);
    expect(next.forwardedByRole).toBe('teacher');
    expect(
      await db.freeTierApprovalDelivery.count({
        where: { approvalId: next.id, state: 'QUEUED' },
      })
    ).toBe(2);
    await api.runApprovalJobs(new Date());
    expect(send).toHaveBeenCalledTimes(2);
    const message = send.mock.calls.find(
      ([args]) => args.to === 'rivera@example.org'
    )?.[0];
    const token = new URL(
      message.text.match(/http[^\s]+\/free\/admin\/approve\?t=[^\s]+/)[0]
    ).searchParams.get('t')!;
    expect(
      (await peekSignedLink({ token, expectedPurpose: 'ADMIN_APPROVE' })).ok
    ).toBe(true);
  });
  for (const environment of ['demo', 'production'] as const) {
    for (const actor of ['teacher', 'ADMIN_APPROVE', 'ADMIN_NOT_RIGHT_PERSON'] as const) {
      test(`${environment} ${actor} forwarding rejects the teacher mailbox and aliases without side effects`, async () => {
        const previousEnvironment = process.env.YAWP_ENVIRONMENT;
        const previousSlug = process.env.PREVIEW_SLUG;
        process.env.YAWP_ENVIRONMENT = environment;
        delete process.env.PREVIEW_SLUG;
        try {
          const { resolveFreeTierRuntimeEnvironment } = await import('./usage-budget.server');
          expect(resolveFreeTierRuntimeEnvironment()).toBe(environment);
          const { app, approval } = await fixture();
          const local = `teacher.${crypto.randomUUID()}`;
          const teacherEmail = `${local}+account@googlemail.com`;
          await db.freeTierApplication.update({
            where: { id: app.id },
            data: { email: teacherEmail },
          });
          const { mintSignedLink, peekSignedLink } = await import('./signed-link.server');
          const approve = await mintSignedLink({ applicationId: app.id, purpose: 'ADMIN_APPROVE' });
          const forward = await mintSignedLink({ applicationId: app.id, purpose: 'ADMIN_NOT_RIGHT_PERSON' });
          await db.freeTierAdminApproval.update({
            where: { id: approval.id },
            data: { signedLinkId: approve.linkId },
          });
          // Include an existing queued slot so rejection must preserve, rather
          // than cancel or replace, already scheduled delivery work.
          expect((await api.queueManualApprovalReminder({
            applicationId: app.id,
            idempotencyKey: `self-forward-${app.id}`,
            now: new Date(+now + 1000),
          })).ok).toBe(true);
          const snapshot = () => db.freeTierApplication.findUniqueOrThrow({
            where: { id: app.id },
            include: {
              signedLinks: { orderBy: { id: 'asc' } },
              adminApprovals: { orderBy: { id: 'asc' }, include: { deliveries: { orderBy: { id: 'asc' } } } },
              approvalDecisions: { orderBy: { id: 'asc' } },
              emailLogs: { orderBy: { id: 'asc' } },
            },
          });
          const before = await snapshot();
          for (const newAdminEmail of [
            teacherEmail,
            `  ${teacherEmail.toUpperCase()}  `,
            `${local}@googlemail.com`,
            `${local}+other@googlemail.com`,
            `${local.replaceAll('.', '')}+other@gmail.com`,
            `${local.replaceAll('.', '')}@gmail.com`,
          ]) {
            const input = { newAdminName: 'Teacher as administrator', newAdminEmail, request: new Request('http://localhost/test') };
            const result = actor === 'teacher'
              ? await api.forwardApprovalRequest({ ...input, applicationId: app.id, currentApprovalId: approval.id, userId: app.userId! })
              : await api.forwardApprovalByToken({ ...input, purpose: actor, token: actor === 'ADMIN_APPROVE' ? approve.token : forward.token });
            expect(result).toMatchObject({ ok: false, reason: 'same_as_teacher' });
            expect(await snapshot()).toEqual(before);
            expect((await peekSignedLink({ token: approve.token, expectedPurpose: 'ADMIN_APPROVE' })).ok).toBe(true);
            expect((await peekSignedLink({ token: forward.token, expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON' })).ok).toBe(true);
            expect(send).toHaveBeenCalledTimes(0);
          }
        } finally {
          if (previousEnvironment === undefined) delete process.env.YAWP_ENVIRONMENT;
          else process.env.YAWP_ENVIRONMENT = previousEnvironment;
          if (previousSlug === undefined) delete process.env.PREVIEW_SLUG;
          else process.env.PREVIEW_SLUG = previousSlug;
        }
      });
    }
  }
  test('flag-off, non-target, terminal and forwarded jobs cannot send', async () => {
    const { app } = await fixture();
    await flag('off');
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    expect(send).toHaveBeenCalledTimes(0);
    await flag('targeted', []);
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    expect(send).toHaveBeenCalledTimes(0);
    await flag();
    await db.freeTierApplication.update({
      where: { id: app.id },
      data: { status: 'REJECTED' },
    });
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    expect(send).toHaveBeenCalledTimes(0);
  });
  for (const pause of ['off', 'untargeted'] as const) {
    for (const source of ['auto', 'manual'] as const) {
      test(`${source} delivery resumes when ${pause} rollout pauses after the claim commits`, async () => {
        const { app, approval } = await fixture();
        const clock = new Date(+now + api.WEEK_MS);
        // Isolate the administrator slot from the independent teacher cadence.
        await db.freeTierAdminApproval.update({
          where: { id: approval.id },
          data: { nextTeacherFollowUpAt: new Date(+clock + api.WEEK_MS) },
        });
        const args = {
          applicationId: app.id,
          idempotencyKey: `claim-pause-${pause}-${source}`,
          now: clock,
        };
        if (source === 'manual')
          expect((await api.queueManualApprovalReminder(args)).ok).toBe(true);

        // A fixture-scoped trigger changes rollout in the claim transaction;
        // the dispatch transaction therefore observes the committed pause.
        const trigger = `approval_pause_${crypto.randomUUID().replaceAll('-', '')}`;
        const pausedValue = JSON.stringify({
          mode: pause === 'off' ? 'off' : 'targeted',
          orgIds: [],
        });
        await db.$executeRawUnsafe(`CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW."approvalId" = '${approval.id}' AND NEW.state = 'DELIVERING' AND OLD.state = 'QUEUED' THEN
              UPDATE "Setting" SET value = '${pausedValue}' WHERE name = 'feature_flag.free-tier-onboarding-v2';
            END IF;
            RETURN NEW;
          END $$`);
        try {
          await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" AFTER UPDATE ON "FreeTierApprovalDelivery"
            FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`);
          await api.runApprovalJobs(clock);
          expect(
            (
              await db.setting.findUniqueOrThrow({
                where: { name: 'feature_flag.free-tier-onboarding-v2' },
              })
            ).value
          ).toBe(pausedValue);
        } finally {
          await db.$executeRawUnsafe(
            `DROP TRIGGER IF EXISTS "${trigger}" ON "FreeTierApprovalDelivery"`
          );
          await db.$executeRawUnsafe(`DROP FUNCTION "${trigger}"()`);
        }
        expect(send).toHaveBeenCalledTimes(0);
        const slot = await db.freeTierApprovalDelivery.findFirstOrThrow({
          where: { approvalId: approval.id, kind: 'admin_reminder' },
          select: { id: true, state: true, attempts: true, attemptedAt: true },
        });
        expect(slot).toMatchObject({
          state: 'QUEUED',
          attempts: 0,
          attemptedAt: null,
        });
        await flag();
        await Promise.all([
          api.runApprovalJobs(clock),
          api.runApprovalJobs(clock),
        ]);
        await api.runApprovalJobs(clock);
        expect(send).toHaveBeenCalledTimes(1);
        expect(
          await db.freeTierApprovalDelivery.findUniqueOrThrow({
            where: { id: slot.id },
          })
        ).toMatchObject({
          state: 'SENT',
          attempts: 1,
          acceptedReminderCount: 1,
        });
        expect(
          await db.freeTierAdminApproval.findUniqueOrThrow({
            where: { id: approval.id },
          })
        ).toMatchObject({ reminderCount: 1, needsManualFollowUp: false });
        if (source === 'manual') {
          const accepted = await api.resendApprovalReminder(args);
          expect(accepted).toMatchObject({
            ok: true,
            reminderCount: 1,
            sentAt: clock,
          });
          expect(await api.resendApprovalReminder(args)).toEqual(accepted);
          expect(send).toHaveBeenCalledTimes(1);
        }
        // A fresh key works at the shared cooldown boundary and is replayable.
        const next = {
          ...args,
          idempotencyKey: `${args.idempotencyKey}-next`,
          now: new Date(+clock + 600000),
        };
        const accepted = await api.resendApprovalReminder(next);
        expect(accepted).toMatchObject({
          ok: true,
          reminderCount: 2,
          sentAt: next.now,
        });
        expect(await api.resendApprovalReminder(next)).toEqual(accepted);
        expect(send).toHaveBeenCalledTimes(2);
      });
    }
  }

  test('confirmed rejection retries without incrementing counts; ambiguous send never repeats', async () => {
    const { approval } = await fixture();
    send.mockImplementationOnce(async () => ({
      status: 'error',
      error: { statusCode: 429, message: 'rate limited' },
    }));
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    expect(
      (
        await db.freeTierAdminApproval.findUniqueOrThrow({
          where: { id: approval.id },
        })
      ).reminderCount
    ).toBe(0);
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS + 3600001));
    expect(
      (
        await db.freeTierAdminApproval.findUniqueOrThrow({
          where: { id: approval.id },
        })
      ).reminderCount
    ).toBe(1);
    send.mockImplementation(async () => {
      throw new Error('connection interrupted');
    });
    await api.runApprovalJobs(new Date(+now + 2 * api.WEEK_MS));
    const attempts = send.mock.calls.length;
    await api.runApprovalJobs(new Date(+now + 2 * api.WEEK_MS + 3600001));
    expect(send).toHaveBeenCalledTimes(attempts);
  });
  test('enrollment counts legacy current-admin reminders and uses real first send', async () => {
    const { app, approval } = await fixture();
    const createdAt = new Date(+now - 1000);
    await db.freeTierAdminApproval.update({
      where: { id: approval.id },
      data: {
        createdAt,
        firstSentAt: null,
        nextAutoReminderAt: null,
        nextTeacherFollowUpAt: null,
      },
    });
    await db.freeTierEmailLog.create({
      data: {
        applicationId: app.id,
        kind: 'admin_approval',
        toEmail: approval.adminEmail,
        success: true,
        createdAt: now,
      },
    });
    for (let i = 1; i <= 4; i++)
      await db.freeTierEmailLog.create({
        data: {
          applicationId: app.id,
          kind: 'admin_approval_reminder',
          toEmail: approval.adminEmail,
          success: true,
          createdAt: new Date(+now + i * 1000),
        },
      });
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    const row = await db.freeTierAdminApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(row.reminderCount).toBe(4);
    expect(row.firstSentAt).toEqual(now);
    expect(row.autoRemindersStopped).toBe(true);
    expect(send).toHaveBeenCalledTimes(1); // Teacher only.
  });
  test('replacement link approves; old approval and forward links cannot mutate after forwarding', async () => {
    const { app, approval } = await fixture();
    const { mintSignedLink } = await import('./signed-link.server');
    const { completeSchoolAdminApproval } =
      await import('./approval-flow.server');
    const old = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_APPROVE',
    });
    const oldForward = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval.id },
      data: { signedLinkId: old.linkId },
    });
    const request = new Request('http://localhost/test');
    const forwarded = await api.forwardApprovalByToken({
      token: oldForward.token,
      newAdminName: 'Rivera',
      newAdminEmail: 'rivera@example.org',
      request,
    });
    expect(forwarded.ok).toBe(true);
    expect(
      (
        await completeSchoolAdminApproval({
          token: old.token,
          adminRole: 'Principal',
          authorized: true,
          request,
        })
      ).ok
    ).toBe(false);
    expect(
      (
        await api.forwardApprovalByToken({
          token: oldForward.token,
          newAdminName: 'Other',
          newAdminEmail: 'other@example.org',
          request,
        })
      ).ok
    ).toBe(false);
    await api.runApprovalJobs(new Date());
    const message = send.mock.calls.find(
      ([args]) => args.to === 'rivera@example.org'
    )?.[0];
    const token = new URL(
      message.text.match(/http[^\s]+\/free\/admin\/approve\?t=[^\s]+/)[0]
    ).searchParams.get('t')!;
    expect(
      (
        await completeSchoolAdminApproval({
          token,
          adminRole: 'Principal',
          authorized: true,
          request,
        })
      ).ok
    ).toBe(true);
    expect(
      (
        await db.freeTierApplication.findUniqueOrThrow({
          where: { id: app.id },
        })
      ).status
    ).toBe('APPROVED');
    const current = await db.freeTierAdminApproval.findFirstOrThrow({
      where: { applicationId: app.id, status: 'APPROVED' },
    });
    expect(current.stopReason).toBe('approved');
    expect(current.nextTeacherFollowUpAt).toBeNull();
  });
  test('flag pauses queued jobs; terminal and replaced jobs are cancelled, with terminal cadence stopped', async () => {
    const { app, approval } = await fixture();
    await api.queueManualApprovalReminder({
      applicationId: app.id,
      idempotencyKey: 'pause-me',
      now,
    });
    await flag('off');
    await api.runApprovalJobs(new Date(+now + 1000));
    expect(send).toHaveBeenCalledTimes(0);
    await flag();
    await db.freeTierApplication.update({
      where: { id: app.id },
      data: { status: 'EXPIRED' },
    });
    await api.runApprovalJobs(new Date(+now + 2000));
    expect(send).toHaveBeenCalledTimes(0);
    expect(
      (
        await db.freeTierAdminApproval.findUniqueOrThrow({
          where: { id: approval.id },
        })
      ).nextAutoReminderAt
    ).toBeNull();
    expect(
      await db.freeTierApprovalDelivery.count({
        where: { approvalId: approval.id, state: 'QUEUED' },
      })
    ).toBe(0);
  });
  test('paused expired links are refreshed before sending; delivery claims survive an interrupted worker', async () => {
    const { app, approval } = await fixture();
    await api.queueManualApprovalReminder({
      applicationId: app.id,
      idempotencyKey: 'expire-me',
      now,
    });
    await db.freeTierSignedLink.updateMany({
      where: { applicationId: app.id },
      data: { expiresAt: new Date(0) },
    });
    await api.runApprovalJobs(new Date(+now + 1000));
    const message = send.mock.calls[0][0];
    const token = new URL(
      message.text.match(/http[^\s]+\/free\/admin\/approve\?t=[^\s]+/)[0]
    ).searchParams.get('t')!;
    const { peekSignedLink } = await import('./signed-link.server');
    expect(
      (await peekSignedLink({ token, expectedPurpose: 'ADMIN_APPROVE' })).ok
    ).toBe(true);
    await api.queueManualApprovalReminder({
      applicationId: app.id,
      idempotencyKey: 'interrupted',
      now: new Date(+now + 601001),
    });
    await db.freeTierApprovalDelivery.updateMany({
      where: { approvalId: approval.id, state: 'QUEUED' },
      data: { state: 'DELIVERING', attemptedAt: now },
    });
    const attempts = send.mock.calls.length;
    await api.runApprovalJobs(new Date(+now + 1200000));
    expect(send).toHaveBeenCalledTimes(attempts);
    expect(
      (
        await db.freeTierAdminApproval.findUniqueOrThrow({
          where: { id: approval.id },
        })
      ).needsManualFollowUp
    ).toBe(true);
  });

  test('more than 100 paused applications/jobs cannot starve an eligible request', async () => {
    const paused = Array.from({ length: 101 }, (_, i) => ({
      id: `a-paused-${i}-${crypto.randomUUID()}`,
      name: 'Paused',
      email: `paused-${crypto.randomUUID()}@example.org`,
      schoolName: 'Local',
      location: 'Local',
      gradeLevel: '11',
      userId: 'approval-test-user',
      organizationId,
      status: 'MANUAL_REVIEW' as const,
    }));
    await db.freeTierApplication.createMany({ data: paused });
    ids.push(...paused.map((a) => a.id));
    const approval = await db.freeTierAdminApproval.create({
      data: {
        applicationId: paused[0].id,
        adminName: 'Paused',
        adminEmail: 'paused@example.org',
        emailCopyVersionHash: 'test',
      },
    });
    await db.freeTierApprovalDelivery.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        id: `a-paused-job-${String(i).padStart(3, '0')}-${crypto.randomUUID()}`,
        approvalId: approval.id,
        kind: 'admin_reminder',
        sequence: i,
        availableAt: now,
        payload: 'paused-unreadable',
      })),
    });
    const { approval: eligible } = await fixture();
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    expect(
      (
        await db.freeTierAdminApproval.findUniqueOrThrow({
          where: { id: eligible.id },
        })
      ).reminderCount
    ).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
  });
  test('unreadable payload is isolated and does not block the teacher notification', async () => {
    const { app, approval } = await fixture();
    await api.queueManualApprovalReminder({
      applicationId: app.id,
      idempotencyKey: 'unreadable',
      now,
    });
    await db.freeTierApprovalDelivery.updateMany({
      where: { approvalId: approval.id },
      data: { payload: 'unreadable' },
    });
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    expect(
      (
        await db.freeTierAdminApproval.findUniqueOrThrow({
          where: { id: approval.id },
        })
      ).needsManualFollowUp
    ).toBe(true);
    expect(
      await db.freeTierApprovalDelivery.count({
        where: { approvalId: approval.id, state: 'UNCERTAIN' },
      })
    ).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('staff decisions serialize with a delivery already in flight, and reject later forwards', async () => {
    const { app, approval } = await fixture();
    await api.queueManualApprovalReminder({
      applicationId: app.id,
      idempotencyKey: 'staff-race',
      now,
    });
    let started!: () => void, finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    send.mockImplementationOnce(async () => {
      started();
      await gate;
      return { status: 'success', data: { id: 'captured' } };
    });
    const drain = api.runApprovalJobs(new Date(+now + 1000));
    await entered;
    const { decideApplication } =
      await import('~/utils/internal-free-tier-http.server');
    let decided = false;
    const decision = decideApplication({
      id: app.id,
      decision: 'REJECTED',
      decidedByEmail: 'staff@example.org',
      reason: 'Local fixture',
    }).then((result) => {
      decided = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(decided).toBe(false);
    finish();
    await drain;
    expect((await decision).status).toBe(200);
    expect(
      (
        await api.forwardApprovalRequest({
          applicationId: app.id,
          userId: 'approval-test-user',
          currentApprovalId: approval.id,
          newAdminName: 'Other',
          newAdminEmail: 'other@example.org',
          request: new Request('http://localhost/test'),
        })
      ).ok
    ).toBe(false);
    expect(
      (
        await db.freeTierApplication.findUniqueOrThrow({
          where: { id: app.id },
        })
      ).status
    ).toBe('REJECTED');
  });
  test('existing resend adapter returns actual acceptance and replays without another send', async () => {
    const { app } = await fixture();
    const args = {
      applicationId: app.id,
      idempotencyKey: 'adapter-replay',
      actorEmail: 'staff@example.org',
      now: new Date(+now + 1000),
    };
    const first = await api.resendApprovalReminder(args);
    expect(first).toMatchObject({
      ok: true,
      reminderCount: 1,
      toEmail: 'patel+approval@example.org',
      sentAt: args.now,
    });
    expect(await api.resendApprovalReminder(args)).toEqual(first);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('re-enabling reconciles legacy sends with delivery logs once and enforces the shared cap', async () => {
    const { app, approval } = await fixture();
    for (let i = 1; i <= 3; i++) {
      expect(
        (
          await api.resendApprovalReminder({
            applicationId: app.id,
            idempotencyKey: `before-pause-${i}`,
            now: new Date(+now + i * 660000),
          })
        ).ok
      ).toBe(true);
    }
    await flag('off');
    const { resendFreeTierAdminApprovalReminder } =
      await import('./approval-flow.server');
    expect(
      (
        await resendFreeTierAdminApprovalReminder({
          applicationId: app.id,
          request: new Request('http://localhost/test'),
        })
      ).ok
    ).toBe(true);
    const legacy = await db.freeTierEmailLog.findFirstOrThrow({
      where: {
        applicationId: app.id,
        kind: 'admin_approval_reminder',
        success: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const lastSentAt = new Date(+now + 4 * 660000);
    await db.freeTierEmailLog.update({
      where: { id: legacy.id },
      data: { createdAt: lastSentAt },
    });
    expect(send).toHaveBeenCalledTimes(4);
    await flag();
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    expect(
      await api.queueManualApprovalReminder({
        applicationId: app.id,
        idempotencyKey: 'after-pause',
        now: new Date(+lastSentAt + 660000),
      })
    ).toEqual({ ok: false, reason: 'not_allowed' });
    // Repeated scheduling must not count the three delivery-backed logs twice.
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    expect(
      await db.freeTierAdminApproval.findUniqueOrThrow({
        where: { id: approval.id },
      })
    ).toMatchObject({
      reminderCount: 4,
      lastReminderAt: lastSentAt,
      lastReminderSource: 'manual',
      autoRemindersStopped: true,
      stopReason: 'max_reached',
      needsManualFollowUp: true,
      nextAutoReminderAt: null,
    });
    expect(send).toHaveBeenCalledTimes(5); // Only the teacher follow-up is additional.
  });

  test('legacy accepted-send time enforces the manual cooldown before and at ten minutes', async () => {
    const { app, approval } = await fixture();
    await db.freeTierAdminApproval.update({
      where: { id: approval.id },
      data: { firstSentAt: null },
    });
    await db.freeTierEmailLog.createMany({
      data: [
        {
          applicationId: app.id,
          kind: 'admin_approval',
          toEmail: approval.adminEmail,
          success: true,
          createdAt: now,
        },
        {
          applicationId: app.id,
          kind: 'admin_approval_reminder',
          toEmail: approval.adminEmail,
          success: true,
          createdAt: new Date(+now + 1000),
        },
        // Failed attempts must not change the accepted-send cooldown or count.
        {
          applicationId: app.id,
          kind: 'admin_approval_reminder',
          toEmail: approval.adminEmail,
          success: false,
          createdAt: new Date(+now + 599999),
        },
      ],
    });
    for (const elapsed of [60000, 599999]) {
      expect(
        await api.queueManualApprovalReminder({
          applicationId: app.id,
          idempotencyKey: `too-soon-${elapsed}`,
          now: new Date(+now + 1000 + elapsed),
        })
      ).toEqual({ ok: false, reason: 'rate_limited' });
    }
    const result = await api.resendApprovalReminder({
      applicationId: app.id,
      idempotencyKey: 'at-boundary',
      now: new Date(+now + 601000),
    });
    expect(result).toMatchObject({
      ok: true,
      reminderCount: 2,
      sentAt: new Date(+now + 601000),
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('idempotent replay preserves acceptance count and cadence after later manual and automatic sends', async () => {
    const { app } = await fixture();
    const args = {
      applicationId: app.id,
      idempotencyKey: 'immutable-A',
      now: new Date(+now + 1000),
    };
    const first = await api.resendApprovalReminder(args);
    expect(first).toMatchObject({
      ok: true,
      reminderCount: 1,
      nextAutoReminderAt: new Date(+now + api.WEEK_MS),
    });
    expect(
      (
        await api.resendApprovalReminder({
          ...args,
          idempotencyKey: 'immutable-B',
          now: new Date(+now + 661000),
        })
      ).ok
    ).toBe(true);
    expect(await api.resendApprovalReminder(args)).toEqual(first);
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    expect(await api.resendApprovalReminder(args)).toEqual(first);
    expect(await api.queueManualApprovalReminder(args)).toMatchObject({
      ok: true,
      queued: false,
      reminderCount: 1,
      nextAutoReminderAt: new Date(+now + api.WEEK_MS),
    });
    expect(send).toHaveBeenCalledTimes(4); // Three admin sends and one teacher follow-up.
  });

  test('a queued delivery resumes after the recovered legacy cooldown with its actual acceptance count', async () => {
    const { app, approval } = await fixture();
    const args = {
      applicationId: app.id,
      idempotencyKey: 'queued-before-pause',
      now,
    };
    expect((await api.queueManualApprovalReminder(args)).ok).toBe(true);
    await flag('off');
    const { resendFreeTierAdminApprovalReminder } =
      await import('./approval-flow.server');
    expect(
      (
        await resendFreeTierAdminApprovalReminder({
          applicationId: app.id,
          request: new Request('http://localhost/test'),
        })
      ).ok
    ).toBe(true);
    await db.freeTierEmailLog.updateMany({
      where: {
        applicationId: app.id,
        success: true,
        kind: 'admin_approval_reminder',
      },
      data: { createdAt: new Date(+now + 1000) },
    });
    await flag();
    await api.runApprovalJobs(new Date(+now + 61000));
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await db.freeTierApprovalDelivery.findFirstOrThrow({
        where: { approvalId: approval.id },
      })
    ).toMatchObject({ state: 'QUEUED' });
    const accepted = await api.resendApprovalReminder({
      ...args,
      now: new Date(+now + 601000),
    });
    expect(accepted).toMatchObject({
      ok: true,
      reminderCount: 2,
      sentAt: new Date(+now + 601000),
    });
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    expect(await api.resendApprovalReminder(args)).toEqual(accepted);
    expect(send).toHaveBeenCalledTimes(4);
  });

  test('acceptance migration backfills older manual and automatic results without mutable approval metadata', async () => {
    const { app, approval } = await fixture();
    const a = {
      applicationId: app.id,
      idempotencyKey: 'backfill-A',
      now: new Date(+now + 1000),
    };
    const original = await api.resendApprovalReminder(a);
    await api.runApprovalJobs(new Date(+now + api.WEEK_MS));
    const b = {
      ...a,
      idempotencyKey: 'backfill-B',
      now: new Date(+now + api.WEEK_MS + 660000),
    };
    const second = await api.resendApprovalReminder(b);
    const c = {
      ...a,
      idempotencyKey: 'backfill-C',
      now: new Date(+now + api.WEEK_MS + 1320000),
    };
    const fourth = await api.resendApprovalReminder(c);
    expect(fourth).toMatchObject({
      ok: true,
      reminderCount: 4,
      nextAutoReminderAt: null,
    });
    await db.freeTierApprovalDelivery.updateMany({
      where: { approvalId: approval.id },
      data: { acceptedReminderCount: null, acceptedNextAutoReminderAt: null },
    });
    const migration = readFileSync(
      new URL(
        '../../../../../packages/prisma/migrations/20261016221500_approval_delivery_acceptance/migration.sql',
        import.meta.url
      ),
      'utf8'
    );
    // Scope the real backfill statement to this fixture in the shared local DB.
    await db.$executeRawUnsafe(
      migration
        .slice(migration.indexOf('UPDATE "FreeTierApprovalDelivery"'))
        .replace(/;\s*$/, ' AND approval."applicationId" = $1;'),
      app.id
    );
    expect(await api.resendApprovalReminder(a)).toEqual(original);
    expect(await api.resendApprovalReminder(b)).toEqual(second);
    expect(await api.resendApprovalReminder(c)).toEqual(fourth);
    expect(send).toHaveBeenCalledTimes(5);
  });
});
