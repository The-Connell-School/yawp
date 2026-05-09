import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setReleasedGradesOrganizationForOrganization } from '../db-helpers';

async function seedReleasedSubmission(params: {
  prisma: ReturnType<typeof createE2EPrismaClient>;
  classId: string;
  profileId: string;
  title: string;
  grade: number;
}) {
  const { prisma, classId, profileId, title, grade } = params;
  const studentProfile = await prisma.studentProfile.findFirstOrThrow({
    where: { profileId },
    select: { id: true },
  });
  const assignmentType = await prisma.assignmentType.create({
    data: {
      title,
      position: grade,
    },
    select: { id: true },
  });
  const assignment = await prisma.assignment.create({
    data: {
      classId,
      assignmentTypeId: assignmentType.id,
      title,
      prompt: `${title} prompt`,
    },
    select: { id: true },
  });
  const document = await prisma.document.create({
    data: {
      title: `${title} document`,
      text: `${title} response`,
      html: `<p>${title} response</p>`,
      profileId,
      studentProfileId: studentProfile.id,
      assignmentTypeId: assignmentType.id,
      assignmentId: assignment.id,
    },
    select: { id: true },
  });
  await prisma.submission.create({
    data: {
      documentId: document.id,
      title: `${title} submission`,
      text: `${title} response`,
      html: `<p>${title} response</p>`,
      submittedAt: new Date(),
      gradedAt: new Date(),
      numericPercentage: grade,
      letterGrade: 'A',
      releasedAt: new Date(),
    },
  });
}

test.describe.serial('Released grades organization view', () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await setReleasedGradesOrganizationForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: false,
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('redirects to class page when feature flag is OFF', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setReleasedGradesOrganizationForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: false,
    });
    await prisma.$disconnect();

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}/released-grades`);
    await page.waitForLoadState('networkidle');

    // Loader throws redirect → URL settles on the class page.
    await expect(page).toHaveURL(
      new RegExp(`/app/my-classes/${e2eContext.classId}(\\?|$)`)
    );
  });

  test('renders the released-grades view when feature flag is ON', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setReleasedGradesOrganizationForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: true,
    });
    await prisma.$disconnect();

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}/released-grades`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /Released grades/ })
    ).toBeVisible();
    // By-assignment is the default view; the pivot toggle should be visible.
    await expect(
      page.getByRole('tab', { name: /by assignment/i })
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: /by student/i })
    ).toBeVisible();
  });

  test('"Released grades" link appears on class page when flag is ON', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setReleasedGradesOrganizationForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: true,
    });
    await prisma.$disconnect();

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('link', { name: /Released grades/ })
    ).toBeVisible();
  });

  test('by-student pivot loads via ?view=byStudent when flag is ON', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setReleasedGradesOrganizationForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: true,
    });
    await prisma.$disconnect();

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/my-classes/${e2eContext.classId}/released-grades?view=byStudent`
    );
    await page.waitForLoadState('networkidle');

    const byStudentTab = page.getByRole('tab', { name: /by student/i });
    await expect(byStudentTab).toHaveAttribute('aria-selected', 'true');
  });

  test('expand all opens and collapses multiple released-grade piles', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setReleasedGradesOrganizationForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: true,
    });
    await seedReleasedSubmission({
      prisma,
      classId: e2eContext.classId,
      profileId: e2eContext.profileId,
      title: 'E2E Released Alpha',
      grade: 91,
    });
    await seedReleasedSubmission({
      prisma,
      classId: e2eContext.classId,
      profileId: e2eContext.profileId,
      title: 'E2E Released Beta',
      grade: 83,
    });
    await prisma.$disconnect();

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}/released-grades`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /E2E Released Alpha/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /E2E Released Beta/ })
    ).toBeVisible();
    await expect(page.getByText('91')).toBeHidden();

    await page.getByRole('button', { name: /Expand all/i }).click();
    await expect(page.getByText('91')).toBeVisible();
    await expect(page.getByText('83')).toBeVisible();

    await page.getByRole('button', { name: /Collapse all/i }).click();
    await expect(page.getByText('91')).toBeHidden();
  });
});
