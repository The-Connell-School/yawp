import type { Page } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { createE2EPrismaClient } from '../prisma-client';
import { loadE2eEnvFromFile } from '../test-setup';

loadE2eEnvFromFile();
export const db = createE2EPrismaClient();
const prefix = 'report-local-';
const stamp = new Date('2026-10-01T12:00:00Z');
export const ids: Record<string, string> = {};

export async function seedClassroomReportFixture() {
  const url = new URL(process.env.E2E_DATABASE_URL!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Report fixtures require a disposable local database');
  await db.$transaction(async (db) => {
  const previousOrgs = await db.organization.findMany({ where: { name: { startsWith: 'Report fixture ' } }, select: { id: true } });
  const orgIds = previousOrgs.map(o => o.id);
  const oldDocuments = { classAssignment: { class: { school: { organizationId: { in: orgIds } } } } };
  await db.submission.deleteMany({ where: { document: oldDocuments } });
  await db.documentGroup.deleteMany({ where: { classAssignment: { class: { school: { organizationId: { in: orgIds } } } } } });
  await db.document.deleteMany({ where: oldDocuments });
  const oldAssignments = await db.classAssignment.findMany({ where: { class: { school: { organizationId: { in: orgIds } } } }, select: { assignmentId: true } });
  await db.assignment.deleteMany({ where: { id: { in: oldAssignments.map(a => a.assignmentId) } } });
  await db.class.deleteMany({ where: { school: { organizationId: { in: orgIds } } } });
  await db.school.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.orgMembership.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.organization.deleteMany({ where: { id: { in: orgIds } } });
  await db.freeTierApplication.deleteMany({ where: { email: { startsWith: prefix } } });
  await db.session.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
  await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
  });
  await db.setting.upsert({ where: { name: 'feature_flag.free_tier' }, create: { name: 'feature_flag.free_tier', value: 'true', valueType: 'boolean' }, update: { value: 'true' } });
  const hash = await bcrypt.hash('yawp-dev', 4);
  for (const key of ['main', 'foreign', 'paid']) {
    const org = await db.organization.create({ data: { name: `Report fixture ${key}`, plan: key === 'paid' ? 'SCHOOL' : 'FREE_CLASSROOM' } });
    ids[key] = org.id;
    const school = await db.school.create({ data: { name: `Report fixture ${key}`, code: `${prefix}${key}-${org.id}`, organizationId: org.id } });
    ids[`${key}School`] = school.id;
  }
  for (const [key, org, role] of [
    ['teacher', 'main', 'TEACHER'], ['other', 'main', 'TEACHER'], ['empty', 'main', 'TEACHER'],
    ['foreignTeacher', 'foreign', 'TEACHER'], ['paidTeacher', 'paid', 'TEACHER'],
    ['foreignStudent', 'foreign', 'STUDENT'], ['student', 'main', 'STUDENT'], ['student2', 'main', 'STUDENT'], ['inactive', 'main', 'STUDENT'],
  ] as const) {
    const email = `${prefix}${key.toLowerCase()}@yawp.invalid`;
    const user = await db.user.create({ data: { email, name: `Fixture ${key}`, password: { create: { hash } } } });
    const member = await db.orgMembership.create({ data: { userId: user.id, organizationId: ids[org]!, role, isActive: key !== 'inactive', schools: role === 'TEACHER' ? { connect: { id: ids[`${org}School`]! } } : undefined } });
    ids[key] = member.id;
    ids[`${key}User`] = user.id;
    if (role === 'TEACHER' && org !== 'paid') await db.freeTierApplication.create({ data: { email, name: 'Fixture teacher', schoolName: 'Local fixture', location: 'Local', gradeLevel: '9', userId: user.id, organizationId: ids[org], status: 'APPROVED' } });
  }
  const type = await db.assignmentType.findFirstOrThrow({ where: { archivedAt: null }, select: { id: true } });
  ids.type = type.id;
  for (const [key, owner, org, archived] of [
    ['class1', 'teacher', 'main', false], ['class2', 'teacher', 'main', false],
    ['archivedClass', 'teacher', 'main', true], ['otherClass', 'other', 'main', false],
    ['foreignClass', 'foreignTeacher', 'foreign', false], ['emptyClass', 'empty', 'main', false],
  ] as const) {
    const klass = await db.class.create({ data: { schoolId: ids[`${org}School`]!, code: `${prefix}${key}`, schoolYear: key === 'class2' ? '2025-2026' : '2026-2027', isArchived: archived, teachers: { connect: { id: ids[owner]! } }, students: key === 'emptyClass' ? undefined : org === 'foreign' ? { connect: { id: ids.foreignStudent! } } : { connect: [{ id: ids.student! }, { id: ids.student2! }, { id: ids.inactive! }] } } });
    ids[key] = klass.id;
    if (key === 'emptyClass') continue;
    const assignment = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'Private fixture prompt', title: `Private ${key}` } });
    const deployment = await db.classAssignment.create({ data: { assignmentId: assignment.id, classId: klass.id } });
    ids[`${key}Assignment`] = assignment.id;
    ids[`${key}Deployment`] = deployment.id;
    if (key === 'class1') continue;
    const doc = await db.document.create({ data: { assignmentTypeId: type.id, assignmentId: assignment.id, classAssignmentId: deployment.id, membershipId: org === 'foreign' ? ids.foreignStudent! : ids.student!, text: 'PRIVATE STUDENT WRITING' } });
    await db.submission.create({ data: { documentId: doc.id, title: 'Private title', text: 'PRIVATE STUDENT WRITING', html: '<p>Private</p>', submittedAt: stamp } });
  }
  // One assignment deployed twice counts as two class assignments. Same roster counts once.
  await db.classAssignment.update({ where: { id: ids.class2Deployment }, data: { assignmentId: ids.class1Assignment } });
  for (const [key, extra] of [
    ['solo', {}], ['deleted', { deletedAt: stamp }], ['archived', { archivedAt: stamp }],
    ['withdrawn', {}], ['archivedSubmission', {}], ['draft', {}],
    ['group', { membershipId: null, artifactKind: 'ASSIGNMENT_GROUP' as const }],
  ] as const) {
    const doc = await db.$transaction(async (tx) => {
    const doc = await tx.document.create({ data: { assignmentTypeId: type.id, assignmentId: ids.class1Assignment, classAssignmentId: ids.class1Deployment, membershipId: ids.student!, ...extra } });
    if (key === 'group') await tx.documentGroup.create({ data: { classAssignmentId: ids.class1Deployment!, label: 'Private group', ordinal: 0, openedAt: stamp, documentId: doc.id, members: { create: [{ membershipId: ids.student! }, { membershipId: ids.student2! }] } } });
    return doc;
    });
    if (key === 'draft') continue;
    for (let index = 0; index < (key === 'solo' ? 3 : 1); index++) await db.submission.create({ data: { documentId: doc.id, title: 'Private title', text: 'PRIVATE STUDENT WRITING', html: '<p>Private</p>', submittedAt: stamp, unsubmittedAt: key === 'withdrawn' ? stamp : null, archivedAt: key === 'archivedSubmission' ? stamp : null } });
    if (key === 'solo') await db.documentRevision.create({ data: { documentId: doc.id, trigger: 'save', text: 'private revision', html: '<p>Private</p>' } });
  }
}

export async function login(page: Page, key = 'teacher') {
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email or handle').fill(`${prefix}${key.toLowerCase()}@yawp.invalid`);
  await page.locator('input[type=password]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL('**/app**');
}
