import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createE2EPrismaClient } from '../prisma-client';

const db = createE2EPrismaClient();
const orgId = 'preview-free-classroom';
const evidence = process.env.FREE_BUNDLE_SHOTS;
const before = process.env.FREE_BUNDLE_BEFORE === '1';
let klass: { id: string };
let teacher: { id: string };
let paidType: { id: string; title: string };
let prewriting: { id: string; title: string };
let originalUsage: {
  organizationId: string;
  kind: string;
  lifetimeCreatedCount: number;
}[] = [];
const createdTitles: string[] = [];

async function capture(page: Page, name: string) {
  if (!evidence) return;
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({
    path: join(evidence, `${page.viewportSize()!.width}-${name}.png`),
    fullPage: true,
    animations: 'disabled',
    style:
      '[data-testid="class-code-trigger"], [data-testid="class-code-display"] { visibility: hidden !important; }',
  });
}
async function login(page: Page, email = 'dev.teacher.free@yawp.local') {
  await page.goto('/auth/login');
  await page.getByLabel('Email or handle').fill(email);
  await page.locator('input[type="password"]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL('**/app**');
}
async function openSheet(page: Page) {
  await page.goto(`/app/my-classes/${klass.id}?tab=assignments`);
  await page
    .getByRole('button', { name: /New Assignment/i })
    .first()
    .click();
  return page.getByRole('dialog');
}

test.beforeAll(async () => {
  const row = await db.class.findFirstOrThrow({
    where: { school: { organizationId: orgId } },
    select: { id: true, teachers: { select: { id: true } } },
  });
  klass = row;
  teacher = row.teachers[0]!;
  paidType = await db.assignmentType.findFirstOrThrow({
    where: { title: 'The Thesis-Driven Essay', archivedAt: null },
    select: { id: true, title: true },
  });
  prewriting = await db.assignmentType.findUniqueOrThrow({
    where: { kind: 'prewriting' },
    select: { id: true, title: true },
  });
  originalUsage = await db.freeClassroomAssignmentKindUsage.findMany({
    where: { organizationId: orgId },
  });
  // Reproduce an existing free organization whose catalog includes paid types.
  await db.organizationAssignmentType.upsert({
    where: {
      organizationId_assignmentTypeId: {
        organizationId: orgId,
        assignmentTypeId: paidType.id,
      },
    },
    create: { organizationId: orgId, assignmentTypeId: paidType.id },
    update: {},
  });
});
test.afterAll(async () => {
  try {
    await db.$transaction(async (tx) => {
      await tx.assignment.deleteMany({
        where: { title: { in: createdTitles } },
      });
      await tx.freeClassroomAssignmentKindUsage.deleteMany({
        where: { organizationId: orgId },
      });
      await tx.freeClassroomAssignmentKindUsage.createMany({
        data: originalUsage,
      });
    });
  } finally {
    await db.$disconnect();
  }
});

for (const width of [1280, 390]) {
  test(`free-classroom entitled default, disabled paid choice, and normal creation (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    const sheet = await openSheet(page);
    const picker = sheet.getByRole('combobox').first();
    if (!before) await expect(picker).toContainText('Class Starter');
    await capture(page, 'default');
    await picker.click();
    await capture(page, 'choices');
    if (before) {
      await expect(
        page.getByRole('option', { name: paidType.title, exact: true })
      ).toHaveAttribute('aria-disabled', 'true');
      return;
    }
    await expect(
      page.getByRole('option', { name: paidType.title, exact: true })
    ).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('option', { name: /Prewriting/ }).click();
    await expect(picker).toContainText('Prewriting');
    const title = `Bundle local essay setup ${width} ${Date.now()}`;
    createdTitles.push(title);
    await sheet.getByLabel(/^Title/).fill(title);
    await sheet
      .getByLabel('Prompt', { exact: true })
      .fill(
        'Explore whether community gardens should be part of new developments.'
      );
    const prior = await db.assignment.count({ where: { title } });
    const post = page.waitForResponse(
      (r) =>
        r.url().includes('/api/assignments/create') &&
        r.request().method() === 'POST'
    );
    await sheet
      .getByRole('button', { name: 'Create Assignment', exact: true })
      .click();
    expect((await post).status()).toBe(200);
    await expect(sheet).not.toBeVisible();
    expect(await db.assignment.count({ where: { title } })).toBe(prior + 1);
    const saved = await db.assignment.findFirstOrThrow({
      where: { title },
      orderBy: { createdAt: 'desc' },
      include: { assignmentType: true, classAssignments: true },
    });
    expect(saved.assignmentTypeId).toBe(prewriting.id);
    expect(saved.assignmentType.rubricJson).toBeTruthy();
    expect(saved.submitForGrade).toBe(true);
    expect(saved.pointValue).toBe(100);
    expect(saved.classAssignments.map((c) => c.classId)).toEqual([klass.id]);
    await capture(page, 'created');
    await page.reload();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await capture(page, 'reloaded');
  });

  test(`no-entitled-types state (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const previous = await db.orgMembership.findUniqueOrThrow({
      where: { id: teacher.id },
      select: { assignmentTypesCustomized: true },
    });
    await db.orgMembership.update({
      where: { id: teacher.id },
      data: { assignmentTypesCustomized: true },
    });
    await db.teacherAssignmentType.createMany({
      data: [{ membershipId: teacher.id, assignmentTypeId: paidType.id }],
      skipDuplicates: true,
    });
    try {
      await login(page);
      const sheet = await openSheet(page);
      await capture(page, 'empty');
      await expect(
        sheet.getByText(/No assignment types are available/)
      ).toBeVisible();
      await expect(
        sheet.getByRole('button', { name: 'Create Assignment', exact: true })
      ).toBeDisabled();
    } finally {
      await db.teacherAssignmentType.deleteMany({
        where: { membershipId: teacher.id, assignmentTypeId: paidType.id },
      });
      await db.orgMembership.update({
        where: { id: teacher.id },
        data: previous,
      });
    }
  });
}

test('actual create handler denies tampered type and cross-organization class with no persistence', async ({
  page,
}) => {
  await login(page);
  const count = await db.assignment.count();
  const usage = await db.freeClassroomAssignmentKindUsage.findMany({
    where: { organizationId: orgId },
    orderBy: { kind: 'asc' },
  });
  const foreign = await db.class.findFirstOrThrow({
    where: { school: { organizationId: { not: orgId } } },
    select: { id: true },
  });
  for (const fields of [
    { classIds: klass.id, assignmentTypeId: paidType.id },
    { classIds: foreign.id, assignmentTypeId: prewriting.id },
  ]) {
    const response = await page.request.post('/api/assignments/create.data', {
      form: {
        intent: 'create-assignment',
        ...fields,
        title: 'Forbidden create',
        prompt: 'A synthetic essay prompt.',
        submitForGrade: 'true',
        pointValue: '100',
      },
    });
    expect(response.status()).toBe(fields.classIds === klass.id ? 403 : 404);
    if (fields.classIds === klass.id) {
      expect(await response.text()).toContain(
        'not included in the free classroom bundle'
      );
    }
  }
  expect(await db.assignment.count()).toBe(count);
  expect(
    await db.freeClassroomAssignmentKindUsage.findMany({
      where: { organizationId: orgId },
      orderBy: { kind: 'asc' },
    })
  ).toEqual(usage);
});

for (const width of [1280, 390]) {
  test(`paid organization still defaults to and enables its essay type (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, 'dev.teacher@yawp.local');
    const paidClass = await db.class.findFirstOrThrow({
      where: {
        teachers: { some: { user: { email: 'dev.teacher@yawp.local' } } },
      },
      select: { id: true },
    });
    await page.goto(`/app/my-classes/${paidClass.id}?tab=assignments`);
    await page
      .getByRole('button', { name: /New Assignment/i })
      .first()
      .click();
    const picker = page.getByRole('dialog').getByRole('combobox').first();
    await expect(picker).toContainText(paidType.title);
    await capture(page, 'paid-default');
    await picker.click();
    const option = page.getByRole('option', {
      name: paidType.title,
      exact: true,
    });
    await expect(option).not.toHaveAttribute('aria-disabled', 'true');
    await capture(page, 'paid-choices');
  });
}

for (const width of [1280, 390]) {
  test(`direct paid type page cannot offer an invalid free-classroom create (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto(`/app/assignment-types/${paidType.id}`);
    await page.getByRole('button', { name: /^New$/ }).click();
    await page
      .getByRole('menuitem', { name: 'Assignment', exact: true })
      .click();
    const sheet = page.getByRole('dialog');
    await capture(page, 'direct-paid-type');
    await expect(
      sheet.getByText(/No assignment types are available/)
    ).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Create Assignment', exact: true })
    ).toBeDisabled();
  });
}

for (const width of [1280, 390]) {
  test(`existing locked paid assignment remains editable with an empty creation catalog (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const membership = await db.orgMembership.findFirstOrThrow({
      where: { user: { email: 'dev.teacher@yawp.local' }, role: 'TEACHER' },
      select: { id: true, assignmentTypesCustomized: true },
    });
    const paidClass = await db.class.findFirstOrThrow({
      where: { teachers: { some: { id: membership.id } } },
      select: { id: true },
    });
    const catalog = await db.teacherAssignmentType.findMany({ where: { membershipId: membership.id } });
    const title = `Existing locked essay ${width} ${Date.now()}`;
    const assignment = await db.assignment.create({
      data: {
        title, prompt: 'Existing community garden prompt.', assignmentTypeId: paidType.id,
        collaborationEnabled: true,
        classAssignments: { create: { classId: paidClass.id } },
      },
    });
    try {
      await db.teacherAssignmentType.deleteMany({ where: { membershipId: membership.id } });
      await db.orgMembership.update({ where: { id: membership.id }, data: { assignmentTypesCustomized: true } });
      await login(page, 'dev.teacher@yawp.local');
      await page.goto(`/app/assignments/${assignment.id}?classId=${paidClass.id}`);
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('combobox').first()).toBeDisabled();
      await expect(sheet.getByText(/type is fixed because shared group drafts/)).toBeVisible();
      const save = sheet.getByRole('button', { name: 'Save Changes', exact: true });
      await capture(page, 'existing-locked-empty-catalog');
      await expect(sheet.locator('input[name="assignmentTypeId"]')).toHaveValue(paidType.id);
      await expect(save).toBeEnabled();
      await sheet.getByLabel(/^Title/).fill(`${title} updated`);
      await sheet.getByLabel('Prompt', { exact: true }).fill('Updated community garden prompt.');
      const response = page.waitForResponse(r => r.url().includes(`/app/assignments/${assignment.id}`) && r.request().method() === 'POST');
      await save.click();
      expect((await response).status()).toBe(200);
      await expect(sheet).not.toBeVisible();
      const saved = await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
      expect(saved.assignmentTypeId).toBe(paidType.id);
      expect(saved.title).toBe(`${title} updated`);
      expect(saved.prompt).toBe('Updated community garden prompt.');
      expect(saved.collaborationEnabled).toBe(true);
      await page.reload();
      await expect(page.getByText(`${title} updated`, { exact: true }).first()).toBeVisible();
      await capture(page, 'existing-locked-saved');
      await page.goto(`/app/my-classes/${paidClass.id}?tab=assignments`);
      await page.getByRole('button', { name: /New Assignment/i }).first().click();
      const createSheet = page.getByRole('dialog');
      await expect(createSheet.getByText(/No assignment types are available/)).toBeVisible();
      await expect(createSheet.getByRole('button', { name: 'Create Assignment', exact: true })).toBeDisabled();
      await capture(page, 'existing-catalog-create-blocked');
    } finally {
      await db.assignment.delete({ where: { id: assignment.id } });
      await db.teacherAssignmentType.deleteMany({ where: { membershipId: membership.id } });
      if (catalog.length) await db.teacherAssignmentType.createMany({ data: catalog });
      await db.orgMembership.update({ where: { id: membership.id }, data: { assignmentTypesCustomized: membership.assignmentTypesCustomized } });
    }
  });
}
