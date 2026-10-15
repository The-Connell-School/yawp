import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { createE2EPrismaClient } from '../prisma-client';

const db = createE2EPrismaClient();
const before = process.env.REPORT_BEFORE === '1';
const evidence = process.env.REPORT_SHOTS;
const prefix = 'report-local-';
const stamp = new Date('2026-10-01T12:00:00Z');
const reportUrl = '/app/classroom-report';
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  const url = new URL(process.env.E2E_DATABASE_URL!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Report fixtures require a disposable local database');
  await db.$transaction(async (db) => {
  const previousOrgs = await db.organization.findMany({ where: { name: { startsWith: 'Report fixture ' } }, select: { id: true } });
  const orgIds = previousOrgs.map(o => o.id);
  const oldDocuments = { classAssignment: { class: { school: { organizationId: { in: orgIds } } } } };
  await db.documentGroup.deleteMany({ where: { classAssignment: { class: { school: { organizationId: { in: orgIds } } } } } });
  await db.submission.deleteMany({ where: { document: oldDocuments } });
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
});
test.afterAll(async () => { await db.$disconnect(); });

async function login(page: Page, key = 'teacher') {
  await page.goto('/auth/login');
  await page.getByLabel('Email or handle').fill(`${prefix}${key.toLowerCase()}@yawp.invalid`);
  await page.locator('input[type=password]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL('**/app**');
}
async function capture(page: Page, name: string) {
  if (!evidence) return;
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(evidence, { recursive: true });
  const file = `${page.viewportSize()!.width}-${name}.png`;
  await page.screenshot({ path: join(evidence, file), fullPage: true, animations: 'disabled', style: '[data-testid="class-code-trigger"], [data-testid="class-code-display"] { visibility:hidden!important }' });
  appendFileSync(join(evidence, 'manifest.jsonl'), JSON.stringify({ file, url: page.url(), viewport: page.viewportSize(), timestamp: new Date().toISOString(), sha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), baseSha: '7fd0ee1ba6ee6880ea19066a3b4437963492f26d', fixture: 'Disposable isolated project CLI local-dev database; report-local-* deterministic persisted fixtures', counts: name.includes('empty') ? [1, 0, 0, 0] : [2, 2, 2, 3], phase: before ? 'before' : 'after' }) + '\n');
}

for (const width of [1280, 390]) test(`teacher navigation, counts, copy and print (${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await login(page);
  await page.goto('/app/my-classes');
  await capture(page, 'entry');
  const entry = page.getByRole('link', { name: 'Share this report', exact: true });
  if (before) { await expect(entry).toHaveCount(0); return; }
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page).toHaveURL(new RegExp(`${reportUrl}$`));
  const report = page.getByTestId('classroom-report');
  await expect(report.getByRole('heading', { name: 'Classroom activity report' })).toBeVisible();
  for (const [metric, value] of [['activeClasses', '2'], ['enrolledStudents', '2'], ['assignments', '2'], ['submittedWriting', '3']]) await expect(report.getByTestId(metric!)).toHaveText(value!);
  await expect(report).toContainText('all years');
  await expect(report).toContainText('Generated at:');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, 'report');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).__copiedReport = text; } } });
    (window as any).__printCount = 0;
    window.print = () => { (window as any).__printCount++; };
  });
  await page.getByRole('button', { name: 'Copy summary', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Summary copied.');
  const text = await page.evaluate(() => (window as any).__copiedReport);
  expect(text).toBe(await page.getByLabel('Plain-text summary').inputValue());
  for (const fragment of ['Active classes: 2', 'Distinct enrolled students: 2', 'Assignments: 2', 'Submitted writing: 3', 'all years', 'Generated at:']) expect(text).toContain(fragment);
  for (const fragment of ['PRIVATE', '@yawp', 'http', 'Fixture teacher']) expect(text).not.toContain(fragment);
  await capture(page, 'copied');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } }); });
  await page.getByRole('button', { name: 'Copy summary', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Could not copy');
  await expect(page.getByLabel('Plain-text summary')).toBeVisible();
  await capture(page, 'copy-failed');
  await page.getByRole('button', { name: 'Print report', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__printCount)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(report).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to My Classes' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy summary', exact: true })).not.toBeVisible();
  await capture(page, 'print');
});

test('empty and partial activity stay honest', async ({ page }) => {
  test.skip(before);
  await login(page, 'empty');
  await page.goto(reportUrl);
  await expect(page.getByTestId('activeClasses')).toHaveText('1');
  for (const metric of ['enrolledStudents', 'assignments', 'submittedWriting']) await expect(page.getByTestId(metric)).toHaveText('0');
  await expect(page.getByText('No submitted writing in this scope yet.')).toBeVisible();
  await capture(page, 'empty');
  await page.setViewportSize({ width: 390, height: 900 });
  await capture(page, 'empty');
  await db.class.update({ where: { id: ids.emptyClass }, data: { isArchived: true } });
  try { await page.reload(); await expect(page.getByTestId('activeClasses')).toHaveText('0'); }
  finally { await db.class.update({ where: { id: ids.emptyClass }, data: { isArchived: false } }); }
});

test('direct requests use the session membership despite crafted teacher, organization and class parameters', async ({ page }) => {
  test.skip(before);
  await login(page);
  const crafted = `${reportUrl}?teacherId=${ids.other}&organizationId=${ids.foreign}&classId=${ids.foreignClass}`;
  await page.goto(crafted);
  await expect(page.getByTestId('submittedWriting')).toHaveText('3');
  const direct = await page.request.get(`${crafted.replace('?', '.data?')}&_routes=routes/app.classroom-report`);
  expect(direct.status()).toBe(200);
  const body = await direct.text();
  expect(body).not.toContain('PRIVATE STUDENT WRITING');
  expect(body).not.toContain(ids.foreignClass!);
  await page.context().clearCookies();
  await login(page, 'other');
  await page.goto(`${reportUrl}?teacherId=${ids.teacher}`);
  await expect(page.getByTestId('activeClasses')).toHaveText('1');
  await expect(page.getByTestId('submittedWriting')).toHaveText('1');
  await page.context().clearCookies();
  await login(page, 'foreignTeacher');
  await page.goto(`${reportUrl}?organizationId=${ids.main}`);
  await expect(page.getByTestId('activeClasses')).toHaveText('1');
  await expect(page.getByTestId('submittedWriting')).toHaveText('1');
});

test('anonymous, student, paid, inactive, approval and feature gates protect direct report requests', async ({ page }) => {
  test.skip(before);
  const anonymous = await page.request.get(`${reportUrl}.data?_routes=routes/app.classroom-report`, { maxRedirects: 0 });
  expect(await anonymous.text()).not.toContain('submittedWriting');
  for (const key of ['student', 'paidTeacher']) {
    await login(page, key);
    await page.goto('/app/my-classes');
    await expect(page.getByRole('link', { name: 'Share this report', exact: true })).toHaveCount(0);
    const denied = await page.request.get(`${reportUrl}.data?_routes=routes/app.classroom-report`, { maxRedirects: 0 });
    expect(denied.status()).toBe(403);
    expect(await denied.text()).not.toContain('submittedWriting');
    await page.context().clearCookies();
  }
  await login(page);
  for (const [status, destination] of [['SENT', '/app/free-tier/pending'], ['ACCOUNT_CREATED', '/app/free-tier/onboarding'], ['EXPIRED', '/app/free-tier/status'], ['REJECTED', '/app/free-tier/status']] as const) {
    await db.freeTierApplication.update({ where: { email: `${prefix}teacher@yawp.invalid` }, data: { status } });
    try {
      const denied = await page.request.get(`${reportUrl}.data?_routes=routes/app.classroom-report`, { maxRedirects: 0 });
      const body = await denied.text();
      expect(body).toContain(destination);
      expect(body).not.toContain('submittedWriting');
    } finally { await db.freeTierApplication.update({ where: { email: `${prefix}teacher@yawp.invalid` }, data: { status: 'APPROVED' } }); }
  }
  await db.orgMembership.update({ where: { id: ids.teacher }, data: { isActive: false } });
  try { expect(await (await page.request.get(`${reportUrl}.data?_routes=routes/app.classroom-report`)).text()).not.toContain('submittedWriting'); }
  finally { await db.orgMembership.update({ where: { id: ids.teacher }, data: { isActive: true } }); }
  await db.setting.update({ where: { name: 'feature_flag.free_tier' }, data: { value: 'false' } });
  try { const denied = await page.request.get(`${reportUrl}.data?_routes=routes/app.classroom-report`); expect(denied.status()).toBe(404); expect(await denied.text()).not.toContain('submittedWriting'); }
  finally { await db.setting.update({ where: { name: 'feature_flag.free_tier' }, data: { value: 'true' } }); }
});
