import { afterAll, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { saveClassPreparation } from './class-preparation.server';
import { provisionFreeClassroom } from './provision-free-classroom.server';
import { submitAdminDetails } from './approval-flow.server';
import { seedFreeTierBundleAssignmentTypes } from '../../../../../packages/prisma/scripts/seed-free-tier-bundle-assignment-types';

const enabled = process.env.CLASS_STEP_DB_TESTS === '1';
const ids: string[] = [];
const userIds: string[] = [];
const orgIds: string[] = [];
const flagName = 'feature_flag.free-tier-onboarding-v2';
async function flag(value: boolean) {
  await prisma.setting.upsert({ where: { name: flagName }, create: { name: flagName, value: String(value), valueType: 'boolean' }, update: { value: String(value) } });
}
async function fixture(status: 'ACCOUNT_CREATED' | 'SENT' | 'APPROVED' = 'ACCOUNT_CREATED') {
  const user = await prisma.user.create({ data: { email: `prepare-${crypto.randomUUID()}@gmail.com`, name: 'Local teacher' } });
  userIds.push(user.id);
  const app = await prisma.freeTierApplication.create({ data: { userId: user.id, email: user.email!, name: user.name!, schoolName: 'Local High', gradeLevel: '11', location: 'Local', status } });
  ids.push(app.id);
  return { user, app };
}
afterAll(async () => {
  if (!enabled) return;
  await flag(false);
  await prisma.freeTierApplication.deleteMany({ where: { id: { in: ids } } });
  await prisma.class.deleteMany({ where: { school: { organizationId: { in: orgIds } } } });
  await prisma.orgMembership.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.school.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organizationAssignmentType.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
test.skipIf(!enabled)('owned, validated, concurrent preparation is persistent and cannot provision or send', async () => {
  await flag(true);
  const { user, app } = await fixture();
  const input = { applicationId: app.id, userId: user.id, className: 'AP English 11', grade: '11' };
  expect((await saveClassPreparation({ ...input, userId: 'someone-else' })).ok).toBe(false);
  expect((await saveClassPreparation({ ...input, className: 'x'.repeat(101) })).ok).toBe(false);
  const blocked = await submitAdminDetails({ applicationId: app.id, userId: user.id, adminName: 'Principal', adminEmail: 'principal@example.edu', adminRole: 'Principal' });
  expect(blocked).toMatchObject({ ok: false, reason: 'class_required' });
  const results = await Promise.all(Array.from({ length: 5 }, () => saveClassPreparation(input)));
  expect(results.every(r => r.ok)).toBe(true);
  const saved = await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } });
  expect(saved).toMatchObject({ starterClassName: 'AP English 11', starterClassGrade: '11', status: 'ACCOUNT_CREATED', organizationId: null });
  expect(await prisma.class.count({ where: { teachers: { some: { userId: user.id } } } })).toBe(0);
  expect(await prisma.freeTierEmailLog.count({ where: { applicationId: app.id } })).toBe(0);
  expect(await prisma.freeTierAdminApproval.count({ where: { applicationId: app.id } })).toBe(0);
  // Model the existing approval boundary without sending an email.
  await prisma.freeTierApplication.update({ where: { id: app.id }, data: { status: 'APPROVED' } });
  await seedFreeTierBundleAssignmentTypes(prisma);
  const provisioned = await Promise.all([provisionFreeClassroom(app.id), provisionFreeClassroom(app.id)]);
  const updated = await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } });
  orgIds.push(updated.organizationId!);
  expect(provisioned.map(r => r.status).sort()).toEqual(['already_provisioned', 'provisioned']);
  const classes = await prisma.class.findMany({ where: { school: { organizationId: updated.organizationId! } } });
  expect(classes).toHaveLength(1);
  expect(classes[0]).toMatchObject({ title: 'AP English 11', grade: '11' });
  expect((await saveClassPreparation(input)).ok).toBe(false);
  await provisionFreeClassroom(app.id);
  expect(await prisma.class.count({ where: { school: { organizationId: updated.organizationId! } } })).toBe(1);
});
test.skipIf(!enabled)('flag off, non-free membership, and in-flight states cannot change preparation', async () => {
  const { user, app } = await fixture();
  const input = { applicationId: app.id, userId: user.id, className: 'English', grade: 'mixed' };
  await flag(false);
  expect((await saveClassPreparation(input)).ok).toBe(false);
  await flag(true);
  for (const status of ['ADMIN_SUBMITTED', 'SENT', 'MANUAL_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'] as const) {
    await prisma.freeTierApplication.update({ where: { id: app.id }, data: { status } });
    expect((await saveClassPreparation(input)).ok).toBe(false);
    expect((await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } })).status).toBe(status);
  }
  await prisma.freeTierApplication.update({ where: { id: app.id }, data: { status: 'ACCOUNT_CREATED' } });
  const org = await prisma.organization.create({ data: { name: 'Existing site', plan: 'SCHOOL' } });
  orgIds.push(org.id);
  await prisma.orgMembership.create({ data: { userId: user.id, organizationId: org.id, role: 'TEACHER' } });
  expect((await saveClassPreparation(input)).ok).toBe(false);
});
test.skipIf(!enabled)('legacy provisioning stays My Class with flag off even if preparation was stored', async () => {
  await flag(true);
  const { user, app } = await fixture();
  await saveClassPreparation({ applicationId: app.id, userId: user.id, className: 'English', grade: 'mixed' });
  await flag(false);
  await prisma.freeTierApplication.update({ where: { id: app.id }, data: { status: 'APPROVED' } });
  await seedFreeTierBundleAssignmentTypes(prisma);
  await provisionFreeClassroom(app.id);
  const updated = await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } });
  orgIds.push(updated.organizationId!);
  expect(await prisma.class.findFirst({ where: { school: { organizationId: updated.organizationId! } } })).toMatchObject({ title: 'My Class', grade: null });
});
