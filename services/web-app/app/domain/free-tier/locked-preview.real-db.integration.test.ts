import { afterAll, beforeAll, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { assertCanCreateAssignmentOfKindInTransaction } from '~/utils/assignment-quota.server';
import { enrollStudentInClassWithSeatCap } from './class-seat-cap.server';
import { reserveAiRequest } from '~/utils/ai-admission.server';
import { handleReporterToolCall } from '~/domain/reporter/reporter-tools.server';
import { handleLessonPlannerToolCall } from '~/domain/lesson-planner/lesson-planner-tools.server';
import { enforceLockedPreviewRequest } from './locked-preview.server';

const enabled = process.env.LOCKED_PREVIEW_DB_TESTS === '1';
const local = enabled ? test : test.skip;
const prefix = `locked-preview-${Date.now()}`;
const flag = 'feature_flag.free-tier-onboarding-v2';
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
  if (originalFlag === null) await prisma.setting.deleteMany({ where: { name: flag } }); else await setFlag(originalFlag);
  await prisma.freeTierApplication.deleteMany({ where: { id: appId } });
  await prisma.aiRequestReservation.deleteMany({ where: { organizationId: orgId } });
  await prisma.freeClassroomAssignmentKindUsage.deleteMany({ where: { organizationId: orgId } });
  await prisma.orgMembership.deleteMany({ where: { organizationId: orgId } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.school.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

local('targeted pending lock rejects shared writers/tools with no writes or usage', async () => {
  const assignmentCount = await prisma.assignment.count();
  const ctx = { membershipId, organizationId: orgId };
  await expect(prisma.$transaction(tx => assertCanCreateAssignmentOfKindInTransaction(tx, { id: orgId, plan: 'FREE_CLASSROOM' }, 'class_starter'))).rejects.toMatchObject({ status: 403 });
  await expect(enrollStudentInClassWithSeatCap({ membershipId, classId, organizationId: orgId })).rejects.toMatchObject({ status: 403 });
  await expect(handleReporterToolCall('list_classes', {}, ctx)).rejects.toMatchObject({ status: 403 });
  await expect(handleLessonPlannerToolCall('search_daily_pages_prompts', {}, ctx)).rejects.toMatchObject({ status: 403 });
  await expect(reserveAiRequest({ ...ctx, feature: 'lesson-planner', policy: { membershipLimit: 10, organizationLimit: 10, membershipWindowMs: 1000, organizationWindowMs: 1000 } })).rejects.toMatchObject({ status: 403 });
  expect(await prisma.assignment.count()).toBe(assignmentCount);
  expect(await prisma.freeClassroomAssignmentKindUsage.count({ where: { organizationId: orgId } })).toBe(0);
  expect(await prisma.aiRequestReservation.count({ where: { organizationId: orgId } })).toBe(0);
  expect(await prisma.orgMembership.count({ where: { classesAsStudent: { some: { id: classId } } } })).toBe(0);
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
