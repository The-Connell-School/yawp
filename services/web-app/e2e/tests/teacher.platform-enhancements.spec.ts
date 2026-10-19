import { readFileSync } from 'node:fs';
import { createE2EPrismaClient } from '../prisma-client';
import type { E2EContext } from '../seed-e2e';
import { test, expect } from '../test-setup';
import { setFeatureFlag } from '../feature-flags';
import { PLATFORM_ENHANCEMENTS_FLAG } from '../../app/domain/feature-flags/feature-flags';

// This suite changes only the isolated E2E database. One worker prevents flag races.
test.describe('Platform enhancements', () => {
  let fiveParagraphId: string;
  let originalModule: { id: string; title: string };
  let addedModuleIds: string[] = [];
  const moduleTitles = [
    'Pre-Writing',
    'Writing your Thesis Statement',
    'Introduction Paragraph',
    'Body Paragraphs',
    'Conclusion Paragraph',
    'Title Your Essay!',
    'Review My Essay!',
  ];
  test.beforeAll(async () => {
    const context = JSON.parse(
      readFileSync(new URL('../.e2e-context.json', import.meta.url), 'utf8')
    ) as E2EContext;
    const db = createE2EPrismaClient();
    try {
      originalModule = await db.assignmentModule.findFirstOrThrow({
        where: { assignmentTypeId: context.thesisEssayAssignmentTypeId },
        select: { id: true, title: true },
      });
      await db.assignmentModule.update({
        where: { id: originalModule.id },
        data: { title: moduleTitles[0] },
      });
      for (const [i, title] of moduleTitles.slice(1).entries()) {
        const module = await db.assignmentModule.create({
          data: {
            assignmentTypeId: context.thesisEssayAssignmentTypeId,
            title,
            position: i + 2,
            description: `Student directions for ${title}.`,
          },
        });
        addedModuleIds.push(module.id);
      }
      const five = await db.assignmentType.create({
        data: {
          title: '5-Paragraph Essay',
          description:
            'A clear claim, three supporting points, and a conclusion.',
          ownerOrgId: context.organizationId,
          organizationAssignments: {
            create: { organizationId: context.organizationId },
          },
          assignmentModules: {
            create: moduleTitles.map((title, i) => ({
              title,
              position: i + 1,
              description: `Student directions for ${title}.`,
            })),
          },
        },
        select: { id: true },
      });
      fiveParagraphId = five.id;
    } finally {
      await db.$disconnect();
    }
  });
  test.afterAll(async () => {
    await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, false);
    const db = createE2EPrismaClient();
    try {
      await db.assignmentModule.deleteMany({
        where: { id: { in: addedModuleIds } },
      });
      if (originalModule)
        await db.assignmentModule.update({
          where: { id: originalModule.id },
          data: { title: originalModule.title },
        });
      if (fiveParagraphId)
        await db.assignmentType.delete({ where: { id: fiveParagraphId } });
    } finally {
      await db.$disconnect();
    }
  });

  for (const width of [1280, 390]) {
    test(`keeps the old presentation when off (${width}px)`, async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, false);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
      );
      if (width === 390)
        await page
          .locator('button')
          .filter({
            has: page.locator(
              'svg path[d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"]'
            ),
          })
          .click();
      await expect(
        page.locator('[data-tour="app-nav"] a[href="/app/assignments"] svg')
      ).toHaveAttribute('width', '20');
      await expect(
        page.locator('[data-tour="app-nav"] a[href="/app/assignments"] svg')
      ).toHaveClass(/lucide-notebook-pen/);
      if (width === 390)
        await page
          .getByRole('button', { name: 'Close app navigation', exact: true })
          .click();
      await expect(
        page.getByRole('button', { name: 'Prompt Library', exact: true })
      ).toHaveAttribute('aria-expanded', 'false');
      await page
        .getByRole('button', { name: 'Prompt Library', exact: true })
        .click();
      await expect(
        page.locator('[data-tour="type-library"] main ul > li')
      ).toHaveCount(100);
      await expect(
        page.getByRole('navigation', { name: 'Prompt library pagination' })
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await expect(
        page.getByRole('menuitem', { name: 'Document', exact: true })
      ).toBeVisible();
      await page.getByRole('menuitem', { name: /assignment/i }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('button', { name: /Advanced/ })).toHaveCount(
        0
      );
      await expect(
        sheet.locator('#assignment-create-submit-for-grade')
      ).toHaveAttribute('role', 'checkbox');
      await expect(
        sheet.getByRole('button', { name: 'Change', exact: true })
      ).toBeVisible();
      await expect(sheet.getByTestId('assignment-sheet-body')).toHaveCount(0);
      await expect(sheet.getByTestId('assignment-sheet-header')).toHaveCount(0);
    });

    test(`regroups the sheet, creates work and pages filtered prompts (${width}px)`, async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, true);
      try {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 900,
        });
        await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
        await page.goto(
          `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
        );
        if (width === 390)
          await page
            .locator('button')
            .filter({
              has: page.locator(
                'svg path[d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"]'
              ),
            })
            .click();
        await expect(
          page.locator('[data-tour="app-nav"] a[href="/app/assignments"] svg')
        ).toHaveClass(/lucide-pen-line/);
        await expect(
          page.locator('[data-tour="app-nav"] a[href="/app/assignments"] svg')
        ).toHaveAttribute('width', '18');
        await expect(
          page.locator('[data-tour="app-nav"] a[href="/app/reporter"] svg')
        ).toHaveAttribute('width', '18');
        if (width === 390)
          await page
            .getByRole('button', { name: 'Close app navigation', exact: true })
            .click();
        await expect(page.getByTestId('type-meta')).toContainText('7 modules');
        await expect(page.getByTestId('type-meta')).toContainText(
          '100 prompts'
        );
        await expect(page.getByTestId('type-meta')).toContainText('Tutor on');
        const newAssignment = page.locator('[data-tour="type-new"]:visible');
        await newAssignment.click();
        await expect(
          page.getByRole('menuitem', { name: /Write a prompt/ })
        ).toBeVisible();
        await expect(
          page.getByRole('menuitem', { name: /Generate a prompt/ })
        ).toBeVisible();
        await expect(
          page.getByRole('menuitem', { name: 'Document', exact: true })
        ).toHaveCount(0);
        await page
          .getByRole('menuitem', { name: /Choose from the library/ })
          .click();
        const library = page.locator('#prompt-library');
        await expect(library.getByPlaceholder('Search prompts')).toBeFocused();
        await expect(library.locator('article')).toHaveCount(12);
        await library
          .getByRole('button', {
            name: width === 390 ? 'Next' : 'Page 2',
            exact: true,
          })
          .click();
        await expect(page).toHaveURL(/promptPage=2/);
        await expect(
          library.getByText('Showing 13–24 of 100', { exact: true })
        ).toBeAttached();
        if (width === 390)
          await library
            .getByRole('button', { name: 'Filter', exact: true })
            .click();
        else
          await library
            .getByRole('button', { name: 'Category', exact: true })
            .click();
        await page.getByRole('checkbox', { name: /A specific text/ }).click();
        await expect(page).not.toHaveURL(/promptPage=2/);
        if (width === 390)
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Close', exact: true })
            .click();
        else await page.keyboard.press('Escape');
        await expect(
          library.getByText('Showing 1–12 of 26', { exact: true })
        ).toBeAttached();
        await library
          .getByRole('button', { name: 'Clear all', exact: true })
          .click();
        await library.getByRole('tab', { name: /My prompts/ }).click();
        await expect(page).toHaveURL(/tp_coll=mine/);
        await library.getByRole('tab', { name: /^Library/ }).click();
        const prompt = await library
          .locator('article')
          .first()
          .locator('[data-prompt]')
          .getAttribute('data-prompt');
        await library
          .locator('article')
          .first()
          .getByRole('button', { name: 'Assign', exact: true })
          .click();
        const sheet = page.getByRole('dialog');
        await expect(
          sheet.getByRole('heading', { name: 'Basics', exact: true })
        ).toBeVisible();
        await expect(
          sheet.getByRole('heading', { name: 'Prompt', exact: true })
        ).toBeVisible();
        await expect(sheet.locator('textarea[name="prompt"]')).toHaveValue(
          prompt!
        );
        const advanced = sheet.getByRole('button', { name: /Advanced/ });
        await expect(advanced).toHaveAttribute('aria-expanded', 'false');
        await expect(sheet.getByTestId('advanced-summary')).toContainText(
          'Tutor on'
        );
        await advanced.click();
        await expect(
          sheet.getByRole('switch', { name: 'Submit for grade', exact: true })
        ).toBeVisible();
        await expect(
          sheet.getByRole('switch', { name: 'Tutor', exact: true })
        ).toBeVisible();
        // The panel is an opaque surface the overlay never tints, fields are
        // white inside white cards, and only the body scrolls.
        const surface = await sheet.evaluate((element) => {
          const alpha = (color: string) => {
            const match = color.match(/rgba?\(([^)]+)\)/);
            const parts = match ? match[1].split(/[ ,/]+/).filter(Boolean) : [];
            return parts.length > 3 ? Number(parts[3]) : 1;
          };
          const title = element.querySelector<HTMLElement>(
            '#assignment-create-title, input[name="title"]'
          );
          const card = title?.closest('section');
          return {
            sheetAlpha: alpha(getComputedStyle(element).backgroundColor),
            titleBackground: title
              ? getComputedStyle(title).backgroundColor
              : '',
            cardBackground: card ? getComputedStyle(card).backgroundColor : '',
          };
        });
        expect(surface.sheetAlpha).toBe(1);
        expect(surface.titleBackground).toBe(surface.cardBackground);
        const body = sheet.getByTestId('assignment-sheet-body');
        await body.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        expect(
          await body.evaluate((element) => element.scrollTop)
        ).toBeGreaterThan(0);
        await expect(
          sheet
            .getByTestId('assignment-sheet-header')
            .getByRole('heading', { name: 'New assignment', exact: true })
        ).toBeInViewport({ ratio: 1 });
        await expect(
          sheet.getByRole('button', { name: 'Close', exact: true })
        ).toBeInViewport({ ratio: 1 });
        await expect(
          sheet.getByTestId('assignment-sheet-footer')
        ).toBeInViewport({
          ratio: 1,
        });
        expect(await sheet.evaluate((element) => element.scrollTop)).toBe(0);
        const points = sheet.getByRole('spinbutton', {
          name: 'Points',
          exact: true,
        });
        await points.fill('0');
        await advanced.click();
        expect(
          await sheet.evaluate(
            (element) => element.scrollWidth - element.clientWidth
          )
        ).toBeLessThanOrEqual(0);
        await expect(
          sheet.getByRole('button', { name: 'Create assignment', exact: true })
        ).toBeInViewport();
        await sheet.locator('[id^="assignment-create-class-"]').first().click();
        const title = `Platform enhancements ${width} ${Date.now()}`;
        await sheet.getByLabel('Title', { exact: true }).fill(title);
        await sheet
          .getByRole('button', { name: 'Create assignment', exact: true })
          .click();
        await expect(advanced).toHaveAttribute('aria-expanded', 'true');
        await expect(points).toBeVisible();
        await expect(points).toBeFocused();
        await expect(sheet.getByRole('alert')).toHaveText(
          'Enter a whole number of points from 1 to 1000.'
        );
        await points.fill('100');
        await expect(sheet.getByRole('alert')).toHaveCount(0);
        await sheet
          .getByRole('button', { name: 'Create assignment', exact: true })
          .click();
        await expect(sheet).not.toBeVisible();
        await page.goto('/app/assignments');
        await expect(
          page.getByRole('link', { name: title, exact: true })
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth
          )
        ).toBeLessThanOrEqual(0);
        await page.goto(
          `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
        );
        await expect(page.locator('#prompt-library article')).toHaveCount(12);
        await expect(
          page.getByText('Showing 1–12 of 200', { exact: true })
        ).toBeAttached();
        await page.goto(`/app/assignment-types/${fiveParagraphId}`);
        await expect(
          page.getByRole('heading', {
            name: 'You write the prompt for this type',
          })
        ).toBeVisible();
        await expect(page.locator('[data-tour="type-modules"]')).toContainText(
          'How students move through it'
        );
        await expect(page.locator('[data-tour="type-new"]:visible')).toHaveText(
          '+ New assignment'
        );
        if (width === 390)
          await expect(page.getByTestId('type-bottom-bar')).toBeVisible();
      } finally {
        await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, false);
      }
    });
  }
  test('saves a corpus prompt once and retains it in My prompts', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, true);
    const db = createE2EPrismaClient();
    let savedId: string | undefined;
    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
      );
      const library = page.locator('#prompt-library');
      await library
        .locator('article')
        .first()
        .getByRole('button', { name: 'Save to My prompts', exact: true })
        .click();
      await expect(
        library
          .locator('article')
          .first()
          .getByRole('button', { name: 'Saved to My prompts', exact: true })
      ).toBeVisible();
      await expect(
        library.getByRole('tab', { name: 'My prompts 1', exact: true })
      ).toBeVisible();
      await library.getByRole('tab', { name: /My prompts/ }).click();
      await expect(library.locator('article')).toHaveCount(1);
      await expect(
        library.getByRole('button', {
          name: 'Saved to My prompts',
          exact: true,
        })
      ).toBeDisabled();
      savedId = (
        await db.savedThesisPrompt.findFirstOrThrow({
          where: {
            membershipId: e2eContext.teacherMembershipId,
            assignmentTypeId: e2eContext.thesisEssayAssignmentTypeId,
          },
        })
      ).id;
    } finally {
      if (savedId)
        await db.savedThesisPrompt.delete({ where: { id: savedId } });
      await db.$disconnect();
      await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, false);
    }
  });

  test('Daily Pages has paged prompts without generation; AP keeps DBQ and LEQ', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, true);
    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
      );
      await expect(page.locator('#prompt-library article')).toHaveCount(12);
      await page.locator('[data-tour="type-new"]:visible').click();
      await expect(
        page.getByRole('menuitem', { name: /Write a prompt/ })
      ).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: /Choose from the library/ })
      ).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: /Generate a prompt/ })
      ).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.goto(
        `/app/assignment-types/${e2eContext.apHistoryAssignmentTypeId}`
      );
      await page
        .getByRole('button', { name: 'Create assignment', exact: true })
        .click();
      await expect(
        page.getByRole('menuitem', { name: /New DBQ/ })
      ).toBeVisible();
      await page.getByRole('menuitem', { name: /New LEQ/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    } finally {
      await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, false);
    }
  });

  test('no classes explains the next step; students retain the legacy page', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, true);
    const db = createE2EPrismaClient();
    const classes = await db.class.findMany({
      where: { teachers: { some: { id: e2eContext.teacherMembershipId } } },
      select: { id: true },
    });
    try {
      for (const c of classes)
        await db.class.update({
          where: { id: c.id },
          data: {
            teachers: { disconnect: { id: e2eContext.teacherMembershipId } },
          },
        });
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
      );
      const trigger = page.locator('[data-tour="type-new"]:visible');
      await expect(trigger).toHaveAttribute('aria-disabled', 'true');
      await trigger.click();
      await expect(
        page.getByText('Add a class before you assign this.', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: /Go to My Classes/ })
      ).toHaveAttribute('href', '/app/my-classes');
    } finally {
      for (const c of classes)
        await db.class.update({
          where: { id: c.id },
          data: {
            teachers: { connect: { id: e2eContext.teacherMembershipId } },
          },
        });
      await db.$disconnect();
      await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, false);
    }
  });

  test('keeps the lock badge and new icons in the free-account sidebar', async ({
    page,
    signIn,
  }) => {
    await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, true);
    await setFeatureFlag('free_tier', true);
    await setFeatureFlag('free-tier-inapp-v2', true);
    try {
      await signIn('dev.teacher.free@yawp.local', 'yawp-dev');
      await page.goto('/app');
      await expect(page.locator('[data-free-account]')).toHaveCount(1);
      const reporter = page.locator(
        '[data-tour="app-nav"] a[href="/app/reporter"]'
      );
      await expect(reporter.locator('svg.lucide-microscope')).toHaveAttribute(
        'width',
        '18'
      );
      await expect(reporter.locator('svg.lucide-lock')).toHaveAttribute(
        'width',
        '12'
      );
      await expect(
        page.locator('[data-tour="app-nav"] a[href="/app/assignments"] svg')
      ).toHaveClass(/lucide-pen-line/);
    } finally {
      await setFeatureFlag('free-tier-inapp-v2', false);
      await setFeatureFlag('free_tier', false);
    }
  });
});
