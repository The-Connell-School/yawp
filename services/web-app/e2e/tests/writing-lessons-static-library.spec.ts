import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const WRITING_PRACTICE_ORGANIZATION_FLAG_KEY = 'writing_practice';

async function setWritingPracticeForOrganization(params: {
  organizationId: string;
  enabled: boolean;
}) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.organizationFlag.upsert({
      where: {
        key_organizationId: {
          key: WRITING_PRACTICE_ORGANIZATION_FLAG_KEY,
          organizationId: params.organizationId,
        },
      },
      create: {
        key: WRITING_PRACTICE_ORGANIZATION_FLAG_KEY,
        organizationId: params.organizationId,
        enabled: params.enabled,
        description: 'E2E writing practice access',
      },
      update: {
        enabled: params.enabled,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Writing practice prototype', () => {
  test.afterEach(async ({ e2eContext }) => {
    await setWritingPracticeForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: false,
    });
  });

  test('hides practice from the student dashboard when the organization flag is off', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setWritingPracticeForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: false,
    });

    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await expect(
      page.getByRole('link', { name: /writing practice/i })
    ).toHaveCount(0);
  });

  test('shows lessons and supports a self-guided practice check when the organization flag is on', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setWritingPracticeForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: true,
    });

    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await page.getByRole('link', { name: /writing practice/i }).click();

    await expect(
      page.getByRole('heading', { name: /writing practice/i })
    ).toBeVisible();
    await expect(
      page.getByText(/self-guided practice/i)
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
    await expect(page.getByText(/practice prompt/i)).toBeVisible();
    await expect(
      page
        .getByRole('complementary')
        .getByText('At this point in time')
    ).toBeVisible();

    await page
      .getByLabel(/your practice response/i)
      .fill('We cannot accept new applications now.');
    await page.getByRole('button', { name: /check response/i }).click();

    await expect(page.getByText(/score preview/i)).toBeVisible();
    await expect(page.getByText(/ready for tutor review/i)).toBeVisible();
    await page.getByRole('button', { name: /try another prompt/i }).click();
    await expect(page.getByText(/weak construction/i)).toBeVisible();
  });
});
