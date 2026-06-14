import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Teacher class page document titles', () => {
  test('shows submission title not document title for submitted work', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const documentTitle = `Essay column doc workspace ${suffix}`;
    const submissionTitle = `Essay column submission ${suffix}`;
    let documentId = '';

    try {
      const document = await prisma.document.create({
        data: {
          title: documentTitle,
          text: 'Essay column body',
          html: '<p>Essay column body</p>',
          membership: { connect: { id: e2eContext.membershipId } },
          assignmentType: { connect: { id: e2eContext.assignmentTypeId } },
          submissions: {
            create: {
              title: submissionTitle,
              text: 'Essay column body',
              html: '<p>Essay column body</p>',
              submittedAt: new Date(),
            },
          },
        },
        select: { id: true },
      });
      documentId = document.id;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&status=needs-grading`
      );
      await page.waitForLoadState('networkidle');

      const row = page.getByRole('row', { name: new RegExp(submissionTitle) });
      await expect(row).toBeVisible();
      await expect(page.getByText(documentTitle)).toHaveCount(0);

      const viewHref = await row
        .getByRole('link', { name: /view details/i })
        .getAttribute('href');
      expect(viewHref).toMatch(/\/app\/submissions\/[^/]+\?edit=1/);
    } finally {
      if (documentId) {
        await prisma.submission
          .deleteMany({ where: { documentId } })
          .catch(() => {});
        await prisma.document
          .delete({ where: { id: documentId } })
          .catch(() => {});
      }
      await prisma.$disconnect();
    }
  });
});
