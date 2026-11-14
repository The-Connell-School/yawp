import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import { setFeatureFlag } from '../feature-flags';
import { openClassAssignmentsTab } from '../test-helpers';
import type { E2EContext } from '../seed-e2e';

// `assignments-grouped-by-type`: My Assignments and a class's Assignments tab
// list assignments in one collapsible section per assignment type, with the
// same headings the Documents page uses when it is grouped. Off: the flat,
// paginated table every teacher has today.

const RUN = Date.now();
const TITLES = {
  exitTicketA: `Grouped exit ticket A ${RUN}`,
  exitTicketB: `Grouped exit ticket B ${RUN}`,
  dailyPages: `Grouped daily pages ${RUN}`,
  thesis: `Grouped thesis essay ${RUN}`,
} as const;

async function seedGroupedAssignments(ctx: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    const titles = Object.values(TITLES);
    const existing = await prisma.assignment.count({
      where: { title: { in: [...titles] } },
    });
    if (existing >= titles.length) return;

    const rows: Array<[string, string]> = [
      [TITLES.exitTicketA, ctx.exitTicketAssignmentTypeId],
      [TITLES.exitTicketB, ctx.exitTicketAssignmentTypeId],
      [TITLES.dailyPages, ctx.dailyPagesAssignmentTypeId],
      [TITLES.thesis, ctx.thesisEssayAssignmentTypeId],
    ];
    for (const [title, assignmentTypeId] of rows) {
      const found = await prisma.assignment.findFirst({
        where: { title },
        select: { id: true },
      });
      if (found) continue;
      await createDeployedAssignment({
        prisma,
        classId: ctx.classId,
        assignmentTypeId,
        title,
        prompt: `${title} prompt`,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function assignmentTypeTitle(id: string) {
  const prisma = createE2EPrismaClient();
  try {
    const type = await prisma.assignmentType.findUniqueOrThrow({
      where: { id },
      select: { title: true },
    });
    return type.title;
  } finally {
    await prisma.$disconnect();
  }
}

function section(page: Page, assignmentTypeId: string) {
  return page.getByTestId(`assignment-type-section-${assignmentTypeId}`);
}

async function expectGroupedByType(page: Page, ctx: E2EContext) {
  await openClassAssignmentsTab(page);
  const exitTicketTitle = await assignmentTypeTitle(
    ctx.exitTicketAssignmentTypeId
  );
  const dailyPagesTitle = await assignmentTypeTitle(
    ctx.dailyPagesAssignmentTypeId
  );
  const thesisTitle = await assignmentTypeTitle(ctx.thesisEssayAssignmentTypeId);

  const exitTickets = section(page, ctx.exitTicketAssignmentTypeId);
  const dailyPages = section(page, ctx.dailyPagesAssignmentTypeId);
  const thesis = section(page, ctx.thesisEssayAssignmentTypeId);

  // One heading per type, named for the type, like the grouped Documents page.
  for (const [locator, title] of [
    [exitTickets, exitTicketTitle],
    [dailyPages, dailyPagesTitle],
    [thesis, thesisTitle],
  ] as const) {
    await expect(locator).toBeVisible();
    await expect(
      locator.getByRole('button', { name: new RegExp(`^${title}`) })
    ).toBeVisible();
  }

  // Every assignment sits under its own type, and only there.
  await expect(exitTickets.getByText(TITLES.exitTicketA)).toBeVisible();
  await expect(exitTickets.getByText(TITLES.exitTicketB)).toBeVisible();
  await expect(exitTickets.getByText(TITLES.dailyPages)).toHaveCount(0);
  await expect(dailyPages.getByText(TITLES.dailyPages)).toBeVisible();
  await expect(dailyPages.getByText(TITLES.exitTicketA)).toHaveCount(0);
  await expect(thesis.getByText(TITLES.thesis)).toBeVisible();

  // Sections are in alphabetical order of type, as the Documents page orders
  // its groups.
  const order = await page
    .locator('[data-testid^="assignment-type-section-"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-assignment-type-title') ?? '')
    );
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  expect(order).toEqual([...order].sort((a, b) => collator.compare(a, b)));

  // The heading collapses and reopens its section.
  const exitHeading = exitTickets.getByRole('button', {
    name: new RegExp(`^${exitTicketTitle}`),
  });
  await expect(exitHeading).toHaveAttribute('aria-expanded', 'true');
  await exitHeading.click();
  await expect(exitHeading).toHaveAttribute('aria-expanded', 'false');
  await expect(exitTickets.getByText(TITLES.exitTicketA)).toBeHidden();
  await exitHeading.click();
  await expect(exitTickets.getByText(TITLES.exitTicketA)).toBeVisible();

  // Search narrows the sections: a type with no match drops out.
  await page.getByRole('textbox', { name: 'Search assignments' }).fill(
    TITLES.thesis
  );
  await expect(thesis.getByText(TITLES.thesis)).toBeVisible();
  await expect(exitTickets).toHaveCount(0);
  await expect(dailyPages).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search assignments' }).fill('');
  await expect(exitTickets).toBeVisible();
}

test.describe.serial('Assignments grouped by assignment type', () => {
  test.afterAll(async () => {
    await setFeatureFlag('assignments-grouped-by-type', false);
  });

  test('flag off: both lists stay one flat table', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignments-grouped-by-type', false);
    await seedGroupedAssignments(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
    await page.waitForLoadState('networkidle');
    await openClassAssignmentsTab(page);
    await page
      .getByRole('textbox', { name: 'Search assignments' })
      .fill('');
    await expect(
      page.locator('[data-testid^="assignment-type-section-"]')
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(
      page.getByRole('table', { name: /assignments/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[data-testid^="assignment-type-section-"]')
    ).toHaveCount(0);

    await page.goto('/app/assignments');
    await expect(
      page.getByRole('table', { name: 'My Assignments' })
    ).toHaveCount(1);
    await expect(
      page.locator('[data-testid^="assignment-type-section-"]')
    ).toHaveCount(0);
  });

  test("flag on: a class's Assignments tab has a section per type", async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignments-grouped-by-type', true);
    await seedGroupedAssignments(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
    await expectGroupedByType(page, e2eContext);

    // A row still opens the assignment.
    await section(page, e2eContext.dailyPagesAssignmentTypeId)
      .getByText(TITLES.dailyPages)
      .click();
    await expect(page).toHaveURL(/\/app\/assignments\/[^/?]+\?classId=/);
  });

  test('flag on: My Assignments has a section per type', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignments-grouped-by-type', true);
    await seedGroupedAssignments(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto('/app/assignments');
    await expectGroupedByType(page, e2eContext);

    // Selecting inside a section still drives the bulk delete bar.
    await section(page, e2eContext.exitTicketAssignmentTypeId)
      .getByRole('checkbox', { name: `Select assignment ${TITLES.exitTicketA}` })
      .check();
    await expect(page.getByTestId('my-assignments-delete-selected')).toBeVisible();

    await section(page, e2eContext.thesisEssayAssignmentTypeId)
      .getByRole('link', { name: TITLES.thesis })
      .click();
    await expect(page).toHaveURL(/\/app\/assignments\/[^/?]+\?classId=/);
  });
});
