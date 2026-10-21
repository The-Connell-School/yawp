import { afterAll, beforeAll, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { assertCanCreateAssignmentOfKindInTransaction } from '~/utils/assignment-quota.server';
import { enrollStudentInClassWithSeatCap } from './class-seat-cap.server';
import { reserveAiRequest } from '~/utils/ai-admission.server';
import { handleReporterToolCall } from '~/domain/reporter/reporter-tools.server';
import { handleLessonPlannerToolCall } from '~/domain/lesson-planner/lesson-planner-tools.server';
import { enforceLockedPreviewRequest } from './locked-preview.server';
import { action as onboardLegacyStudent } from '~/routes/auth.inv.onboard-student/route';
import { invitationCookieStorage } from '~/cookie-session-storages/invitation.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { action as createAssignment } from '~/routes/api.assignments.create/route';
import { action as reporter } from '~/routes/api.domain.reporter/route';
import { action as planner } from '~/routes/api.domain.lesson-planner/route';
import { action as packet } from '~/routes/api.domain.lesson-planner.packet/route';
import { action as tourAction } from '~/routes/api.guided-tours/route';
import { action as students } from '~/routes/app.organization.students/route';
import { loader as preview } from '~/routes/app.free-tier.preview/route';
import { replaceStudentClassRoster } from '~/domain/collaboration/student-roster.server';

const enabled = process.env.LOCKED_PREVIEW_DB_TESTS === '1';
const local = enabled ? test : test.skip;
function actionStatus(result: unknown): number {
  if (result instanceof Response) return result.status;
  if (result && typeof result === 'object' && 'init' in result) {
    return (result as { init?: { status?: number } }).init?.status ?? 200;
  }
  return 200;
}
async function invokeAction(
  action: (args: never) => unknown,
  request: Request
) {
  try {
    return await action({ request } as never);
  } catch (error) {
    return error;
  }
}
const prefix = `locked-preview-${Date.now()}`;
const flag = 'feature_flag.free_tier';
let orgId: string, classId: string, userId: string, membershipId: string, appId: string;
let originalFlag: string | null = null;
async function setFlag(value: string) {
  await prisma.setting.upsert({ where: { name: flag }, create: { name: flag, value }, update: { value } });
}
beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw Error('Local database required');
  originalFlag = (await prisma.setting.findUnique({ where: { name: flag } }))?.value ?? null;
  const org = await prisma.organization.create({ data: { name: prefix, plan: 'FREE_CLASSROOM' } }); orgId = org.id;
  const school = await prisma.school.create({ data: { organizationId: orgId, name: prefix, code: prefix } });
  const klass = await prisma.class.create({ data: { schoolId: school.id, code: prefix } }); classId = klass.id;
  const user = await prisma.user.create({ data: { name: 'Pending teacher', email: `${prefix}@example.test` } }); userId = user.id;
  const member = await prisma.orgMembership.create({ data: { userId, organizationId: orgId, role: 'TEACHER', classesAsTeacher: { connect: { id: classId } } } }); membershipId = member.id;
  const app = await prisma.freeTierApplication.create({ data: { userId, organizationId: orgId, name: 'Pending teacher', email: `${prefix}@example.test`, schoolName: prefix, location: 'Local', gradeLevel: '11', status: 'SENT' } }); appId = app.id;
  await setFlag(JSON.stringify({ mode: 'targeted', orgIds: [orgId] }));
});
afterAll(async () => {
  if (!enabled) return;
  if (!orgId) { await prisma.$disconnect(); return; }
  if (originalFlag === null) await prisma.setting.deleteMany({ where: { name: flag } }); else await setFlag(originalFlag);
  if (appId) await prisma.freeTierApplication.deleteMany({ where: { id: appId } });
  await prisma.aiRequestReservation.deleteMany({ where: { organizationId: orgId } });
  await prisma.freeClassroomAssignmentKindUsage.deleteMany({ where: { organizationId: orgId } });
  await prisma.orgMembership.deleteMany({ where: { organizationId: orgId } });
  if (classId) await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.school.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

local('targeted pending lock rejects teaching writers except lesson planner admission', async () => {
  const assignmentCount = await prisma.assignment.count();
  const ctx = { membershipId, organizationId: orgId };
  await expect(prisma.$transaction(tx => assertCanCreateAssignmentOfKindInTransaction(tx, { id: orgId, plan: 'FREE_CLASSROOM' }, 'class_starter'))).rejects.toMatchObject({ status: 403 });
  await expect(enrollStudentInClassWithSeatCap({ membershipId, classId, organizationId: orgId })).rejects.toMatchObject({ status: 403 });
  await expect(handleReporterToolCall('list_classes', {}, ctx)).rejects.toMatchObject({ status: 403 });
  await handleLessonPlannerToolCall('search_daily_pages_prompts', {}, ctx);
  await reserveAiRequest({ ...ctx, feature: 'lesson-planner', policy: { membershipLimit: 10, organizationLimit: 10, membershipWindowMs: 1000, organizationWindowMs: 1000 } });
  expect(await prisma.assignment.count()).toBe(assignmentCount);
  expect(await prisma.freeClassroomAssignmentKindUsage.count({ where: { organizationId: orgId } })).toBe(0);
  expect(await prisma.aiRequestReservation.count({ where: { organizationId: orgId } })).toBe(1);
  expect(await prisma.orgMembership.count({ where: { classesAsStudent: { some: { id: classId } } } })).toBe(0);
});

local('real authenticated route actions reject crafted requests before parsing or executing tools', async () => {
  const session = await prisma.session.create({ data: { userId, expirationDate: new Date(Date.now() + 3600000) } });
  const cookie = await authSessionStorage.getSession(); cookie.set('sessionId', session.id);
  const headers = { cookie: (await authSessionStorage.commitSession(cookie)).split(';')[0] };
  try {
    for (const [path, action] of [
      ['/api/assignments/create', createAssignment], ['/api/domain/reporter', reporter],
      ['/api/domain/lesson-planner/packet', packet],
      ['/app/organization/students', students],
    ] as const) {
      await expect(action({ request: new Request(`http://localhost${path}`, { method: 'POST', headers, body: 'crafted-invalid-body' }) } as never)).rejects.toMatchObject({ status: 403 });
    }
    const plannerResult = await invokeAction(
      planner,
      new Request('http://localhost/api/domain/lesson-planner', {
        method: 'POST',
        headers,
        body: 'crafted-invalid-body',
      })
    );
    expect(actionStatus(plannerResult)).not.toBe(403);
    try {
      await preview({
        request: new Request(
          'http://localhost/app/free-tier/preview?organizationId=foreign-org',
          { headers }
        ),
      } as never);
      throw new Error('expected redirect');
    } catch (error) {
      expect((error as Response).headers.get('location')).toBe('/app');
    }
    await expect(createAssignment({ request: new Request('http://localhost/api/assignments/create', { method: 'POST' }) } as never)).rejects.toMatchObject({ status: 302 });
  } finally { await prisma.session.delete({ where: { id: session.id } }); }
});

local('the shared roster replacement entry point cannot add students before approval', async () => {
  await expect(replaceStudentClassRoster({ membershipId, nextClassIds: [classId] })).rejects.toMatchObject({ status: 403 });
  expect(await prisma.orgMembership.count({ where: { classesAsStudent: { some: { id: classId } } } })).toBe(0);
});

async function legacyStudentRequest(
  email: string,
  kind: 'klassId' | 'klassIds' | 'schoolId' = 'klassId'
) {
  const invitation = await invitationCookieStorage.getSession();
  invitation.set('email', email);
  if (kind === 'schoolId') {
    const klass = await prisma.class.findUniqueOrThrow({
      where: { id: classId },
    });
    invitation.set('schoolId', klass.schoolId);
  } else invitation.set(kind, kind === 'klassIds' ? [classId] : classId);
  const form = new FormData();
  form.set('name', 'Legacy Student');
  form.set('classId', classId);
  form.set('password', 'password1234');
  form.set('confirmPassword', 'password1234');
  return {
    request: new Request('http://localhost/auth/inv/onboard-student', {
      method: 'POST',
      body: form,
      headers: {
        cookie: (await invitationCookieStorage.commitSession(invitation)).split(
          ';'
        )[0]!,
      },
    }),
  } as never;
}

local(
  'legacy public invitations reject pending enrollment with no user, membership, roster or session writes',
  async () => {
    const counts = async () =>
      Promise.all([
        prisma.user.count(),
        prisma.orgMembership.count(),
        prisma.session.count(),
        prisma.orgMembership.count({
          where: { classesAsStudent: { some: { id: classId } } },
        }),
      ]);
    const before = await counts();
    for (const kind of ['klassId', 'klassIds', 'schoolId'] as const) {
      const email = `${prefix}-${kind}@example.test`;
      await expect(
        onboardLegacyStudent(await legacyStudentRequest(email, kind))
      ).rejects.toMatchObject({ status: 403 });
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      expect(await counts()).toEqual(before);
    }
  }
);

local(
  'approved and flag-OFF legacy public invitations still create the account, roster and session',
  async () => {
    try {
      for (const mode of ['approved', 'flag-off']) {
        await prisma.freeTierApplication.update({
          where: { id: appId },
          data: { status: mode === 'approved' ? 'APPROVED' : 'SENT' },
        });
        await setFlag(
          mode === 'flag-off'
            ? 'false'
            : JSON.stringify({ mode: 'targeted', orgIds: [orgId] })
        );
        const email = `${prefix}-${mode}@example.test`;
        try {
          const response = (await onboardLegacyStudent(
            await legacyStudentRequest(email)
          )) as Response;
          expect(response.status).toBe(302);
          expect(response.headers.get('location')).toBe('/app');
          const user = await prisma.user.findUniqueOrThrow({
            where: { email },
          });
          expect(
            await prisma.orgMembership.count({
              where: {
                userId: user.id,
                organizationId: orgId,
                role: 'STUDENT',
                classesAsStudent: { some: { id: classId } },
              },
            })
          ).toBe(1);
          expect(
            await prisma.session.count({ where: { userId: user.id } })
          ).toBe(1);
        } finally {
          const user = await prisma.user.findUnique({ where: { email } });
          if (user) {
            await prisma.session.deleteMany({ where: { userId: user.id } });
            await prisma.orgMembership.deleteMany({
              where: { userId: user.id },
            });
            await prisma.user.delete({ where: { id: user.id } });
          }
        }
      }
    } finally {
      await prisma.freeTierApplication.update({
        where: { id: appId },
        data: { status: 'SENT' },
      });
      await setFlag(JSON.stringify({ mode: 'targeted', orgIds: [orgId] }));
    }
  }
);


local('waiting tour POST persists only its own progress while all teaching routes stay closed', async () => {
  const names = ['feature_flag.free_tier', 'feature_flag.guided-tours'];
  const original = await prisma.setting.findMany({ where: { name: { in: names } } });
  const session = await prisma.session.create({ data: { userId, expirationDate: new Date(Date.now() + 3600000) } });
  const cookie = await authSessionStorage.getSession(); cookie.set('sessionId', session.id);
  const headers = { cookie: (await authSessionStorage.commitSession(cookie)).split(';')[0] };
  const post = (fields: Record<string, string>) => tourAction({ request: new Request('http://localhost/api/guided-tours', { method: 'POST', headers, body: new URLSearchParams(fields) }), params: {} } as any);
  try {
    for (const name of names) await prisma.setting.upsert({ where: { name }, create: { name, value: 'true', valueType: 'boolean' }, update: { value: 'true' } });
    const before = { assignments: await prisma.assignment.count(), members: await prisma.orgMembership.count(), reservations: await prisma.aiRequestReservation.count() };
    expect((await post({ tourId: 'waiting-preview', status: 'completed' })).status).toBe(200);
    expect((await post({ tourId: 'waiting-preview', status: 'dismissed' })).status).toBe(200);
    expect((await prisma.userTour.findUniqueOrThrow({ where: { userId_tourId: { userId, tourId: 'waiting-preview' } } })).status).toBe('completed');
    for (const fields of [{ tourId: 'dashboard', status: 'completed' }, { intent: 'reset' }] as Record<string, string>[])
      expect((await post(fields)).status).toBe(403);
    for (const path of ['/api/assignments/create', '/api/domain/reporter', '/app/organization/students'])
      await expect(enforceLockedPreviewRequest(new Request(`http://localhost${path}`, { method: 'POST' }), userId)).rejects.toMatchObject({ status: 403 });
    await enforceLockedPreviewRequest(new Request('http://localhost/api/domain/lesson-planner', { method: 'POST' }), userId);
    await expect(enforceLockedPreviewRequest(new Request('http://localhost/api/domain/lesson-planner/packet', { method: 'POST' }), userId)).rejects.toMatchObject({ status: 403 });
    expect(await prisma.assignment.count()).toBe(before.assignments);
    expect(await prisma.orgMembership.count()).toBe(before.members);
    expect(await prisma.aiRequestReservation.count()).toBe(before.reservations);
  } finally {
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.userTour.deleteMany({ where: { userId } });
    for (const name of names) {
      const row = original.find(row => row.name === name);
      if (row) await prisma.setting.update({ where: { name }, data: { value: row.value } });
      else await prisma.setting.deleteMany({ where: { name } });
    }
  }
});

local('pending teacher with stale membership cookie is still denied on default-deny paths', async () => {
  const foreignOrg = await prisma.organization.create({
    data: { name: `${prefix}-stale-cookie`, plan: 'FREE_CLASSROOM' },
  });
  const staleMembership = await prisma.orgMembership.create({
    data: {
      userId,
      organizationId: foreignOrg.id,
      role: 'TEACHER',
    },
  });
  try {
    for (const path of [
      '/app/my-classes',
      '/api/preferences/nav',
    ] as const) {
      await expect(
        enforceLockedPreviewRequest(
          new Request(`http://localhost${path}`, { method: 'POST' }),
          userId,
          staleMembership.id
        )
      ).rejects.toMatchObject({ status: 403 });
    }
  } finally {
    await prisma.orgMembership.delete({ where: { id: staleMembership.id } });
    await prisma.organization.delete({ where: { id: foreignOrg.id } });
  }
});

local('pending teacher lesson planner monthly quota reserves and exhausts', async () => {
  const { monthlyFreeTierPolicy } = await import('./monthly-policy.server');
  const {
    beginMonthlyOperation,
    readMonthlyUsage,
    monthlyOperationResponse,
  } = await import('./monthly-operations.server');
  const policy = await monthlyFreeTierPolicy({
    id: orgId,
    plan: 'FREE_CLASSROOM',
  });
  expect(policy.enabled).toBe(false);
  expect(policy.lessonPlannerMeteringEnabled).toBe(true);
  const cap = policy.limits.lessonPlannerMonthly;
  try {
    for (let i = 0; i < cap; i++) {
      const admitted = await beginMonthlyOperation({
        organizationId: orgId,
        membershipId,
        feature: 'lesson-planner',
        cap,
        requestId: `pending-lp-${i}-${Date.now()}`,
        input: { message: `plan-${i}` },
      });
      expect(admitted.kind).toBe('reserved');
    }
    expect(await readMonthlyUsage(orgId, 'lesson-planner')).toBe(cap);
    const exhausted = await beginMonthlyOperation({
      organizationId: orgId,
      membershipId,
      feature: 'lesson-planner',
      cap,
      requestId: `pending-lp-over-${Date.now()}`,
      input: { message: 'one-more' },
    });
    expect(exhausted.kind).toBe('exhausted');
    if (exhausted.kind === 'exhausted') {
      expect(monthlyOperationResponse(exhausted).status).toBe(403);
    }
  } finally {
    await prisma.setting.deleteMany({
      where: {
        name: { startsWith: `free_tier.monthly.v1:${orgId}:lesson-planner:` },
      },
    });
  }
});

local('flag OFF disables pending lesson planner monthly metering', async () => {
  await setFlag('false');
  try {
    const { monthlyFreeTierPolicy } = await import('./monthly-policy.server');
    const policy = await monthlyFreeTierPolicy({
      id: orgId,
      plan: 'FREE_CLASSROOM',
    });
    expect(policy.lessonPlannerMeteringEnabled).toBe(false);
    await handleLessonPlannerToolCall(
      'search_daily_pages_prompts',
      {},
      { membershipId, organizationId: orgId }
    );
  } finally {
    await setFlag(JSON.stringify({ mode: 'targeted', orgIds: [orgId] }));
  }
});

local('approval restores assignment admission and flag OFF preserves request behavior', async () => {
  const request = new Request('http://localhost/api/assignments/create', { method: 'POST' });
  await setFlag('false');
  await enforceLockedPreviewRequest(request, userId);
  await setFlag(JSON.stringify({ mode: 'targeted', orgIds: [orgId] }));
  await expect(enforceLockedPreviewRequest(request, userId)).rejects.toMatchObject({ status: 403 });
  await prisma.freeTierApplication.update({ where: { id: appId }, data: { status: 'APPROVED' } });
  await enforceLockedPreviewRequest(request, userId);
  await prisma.$transaction(tx => assertCanCreateAssignmentOfKindInTransaction(tx, { id: orgId, plan: 'FREE_CLASSROOM' }, 'class_starter'));
  expect(await prisma.freeClassroomAssignmentKindUsage.count({ where: { organizationId: orgId } })).toBe(1);
});
