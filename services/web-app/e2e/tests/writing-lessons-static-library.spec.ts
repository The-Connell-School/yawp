import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const WRITING_LESSONS_ENABLED_ORG_IDS = 'writing_lessons_enabled_org_ids';

async function setWritingLessonsForOrganization(params: {
  organizationId: string;
  enabled: boolean;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const existing = await prisma.setting.findUnique({
      where: { name: WRITING_LESSONS_ENABLED_ORG_IDS },
      select: { value: true },
    });
    const orgIds = new Set(
      (existing?.value ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    );

    if (params.enabled) {
      orgIds.add(params.organizationId);
    } else {
      orgIds.delete(params.organizationId);
    }

    await prisma.setting.upsert({
      where: { name: WRITING_LESSONS_ENABLED_ORG_IDS },
      create: {
        name: WRITING_LESSONS_ENABLED_ORG_IDS,
        description: 'Organization IDs allowed to use Quick Writing Lessons',
        value: Array.from(orgIds).join(','),
        valueType: 'string',
      },
      update: {
        value: Array.from(orgIds).join(','),
        valueType: 'string',
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Quick Writing Lessons static library', () => {
  test.afterEach(async ({ e2eContext }) => {
    await setWritingLessonsForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: false,
    });
  });

  test('hides the library from the student dashboard when the feature flag is off', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setWritingLessonsForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: false,
    });

    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await expect(
      page.getByRole('link', { name: /quick writing lessons/i })
    ).toHaveCount(0);
  });

  test('shows the recovered lessons and preserves the old lesson text when the feature flag is on', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setWritingLessonsForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: true,
    });

    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await page
      .getByRole('link', { name: /quick writing lessons/i })
      .click();

    await expect(
      page.getByRole('heading', { name: /quick writing lessons/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /revising for wordiness/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /comma splices/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /pronoun agreement/i })
    ).toBeVisible();

    await page.getByRole('link', { name: /revising for wordiness/i }).click();

    await expect(
      page.getByRole('heading', { name: 'Revising for Wordiness' })
    ).toBeVisible();
    await expect(
      page.getByText('Every unnecessary word is a tiny tax')
    ).toBeVisible();
    await expect(page.getByText('At this point in time')).toBeVisible();
  });
});
