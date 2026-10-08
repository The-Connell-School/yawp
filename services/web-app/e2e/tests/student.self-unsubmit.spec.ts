import { test, expect } from '../test-setup';
import { createE2EPrismaClient, type E2EPrismaClient } from '../prisma-client';
import { EDITOR_SELECTOR } from '../test-helpers';
import type { E2EContext } from '../seed-e2e';

const GRADED_REASON =
  "This submission can't be unsubmitted right now. Ask your teacher if you need to make changes.";

async function createSubmissionFixture(
  prisma: E2EPrismaClient,
  context: E2EContext,
  options: { graded: boolean }
) {
  const assignmentModule = await prisma.assignmentModule.findFirstOrThrow({
    where: { assignmentTypeId: context.assignmentTypeId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  const suffix = options.graded ? 'graded' : 'ungraded';
  const text = `Student self-unsubmit ${suffix} document body.`;
  const html = `<p>${text}</p>`;
  const document = await prisma.document.create({
    data: {
      title: `Student self-unsubmit ${suffix}`,
      text,
      html,
      revision: 2,
      membershipId: context.membershipId,
      assignmentTypeId: context.assignmentTypeId,
      assignmentId: context.assignmentId,
      classAssignmentId: context.classAssignmentId,
      revisions: {
        create: [
          {
            html: '<p>First draft.</p>',
            text: 'First draft.',
            trigger: 'auto',
          },
          { html, text, trigger: 'auto' },
        ],
      },
      assignmentModuleSessions: {
        create: {
          assignmentModuleId: assignmentModule.id,
          title: `Self-unsubmit ${suffix} session`,
          instructionsCompleted: 0,
        },
      },
    },
    select: { id: true, text: true, html: true, revision: true },
  });

  const submission = await prisma.submission.create({
    data: {
      documentId: document.id,
      title: `Self-unsubmit ${suffix} submission`,
      text,
      html,
      submittedAt: new Date(),
      ...(options.graded
        ? {
            gradedAt: new Date(),
            gradedByMembershipId: context.teacherMembershipId,
          }
        : {}),
    },
    select: { id: true },
  });

  return { document, submission };
}

test.describe.serial('Student self-unsubmit', () => {
  test('student confirms unsubmit, keeps document history, edits, and resubmits', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      const fixture = await createSubmissionFixture(prisma, e2eContext, {
        graded: false,
      });
      const revisionCountBefore = await prisma.documentRevision.count({
        where: { documentId: fixture.document.id },
      });

      await signIn(e2eContext.userEmail, 'johndoe');
      await page.goto(`/app/documents/${fixture.document.id}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Submissions (1)' }).click();
      const unsubmitButton = page.getByTestId(
        `student-unsubmit-${fixture.submission.id}`
      );
      await expect(unsubmitButton).toBeVisible();
      await expect(unsubmitButton).toBeEnabled();
      await unsubmitButton.click();

      const dialog = page.getByRole('dialog', {
        name: 'Unsubmit this submission?',
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText(
          'This withdraws the submission. Your document stays exactly as it is, so you can keep editing and submit it again.'
        )
      ).toBeVisible();
      await dialog.getByRole('button', { name: 'Unsubmit' }).click();

      const emptySubmissionsButton = page.getByRole('button', {
        name: 'Submissions (0)',
      });
      await expect(emptySubmissionsButton).toBeVisible({ timeout: 15000 });
      await emptySubmissionsButton.click();
      await expect(page.getByText('No active submissions.')).toBeVisible({
        timeout: 15000,
      });

      await expect
        .poll(async () => {
          const submission = await prisma.submission.findUnique({
            where: { id: fixture.submission.id },
            select: { unsubmittedAt: true, unsubmittedByMembershipId: true },
          });
          return submission;
        })
        .toEqual({
          unsubmittedAt: expect.any(Date),
          unsubmittedByMembershipId: e2eContext.membershipId,
        });

      const unchangedDocument = await prisma.document.findUniqueOrThrow({
        where: { id: fixture.document.id },
        select: { text: true, html: true, revision: true },
      });
      expect(unchangedDocument).toEqual({
        text: fixture.document.text,
        html: fixture.document.html,
        revision: fixture.document.revision,
      });
      expect(
        await prisma.documentRevision.count({
          where: { documentId: fixture.document.id },
        })
      ).toBe(revisionCountBefore);

      const editor = page.locator(EDITOR_SELECTOR).first();
      await expect(editor).toHaveAttribute('contenteditable', 'true');
      await editor.click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Revised after withdrawing.');
      await helpers.waitForSaved();

      await expect(page.getByTestId('document-submit-button')).toBeEnabled();
      await page.getByTestId('document-submit-button').click();
      await page.getByTestId('document-finalize-submit').click();

      await expect
        .poll(async () => {
          return prisma.submission.count({
            where: {
              documentId: fixture.document.id,
              unsubmittedAt: null,
            },
          });
        })
        .toBe(1);
      expect(
        await prisma.submission.count({
          where: { documentId: fixture.document.id },
        })
      ).toBe(2);
      const resubmitted = await prisma.submission.findFirstOrThrow({
        where: {
          documentId: fixture.document.id,
          unsubmittedAt: null,
        },
        orderBy: { submittedAt: 'desc' },
        select: { id: true, text: true },
      });
      expect(resubmitted.id).not.toBe(fixture.submission.id);
      expect(resubmitted.text).toContain('Revised after withdrawing.');
    } finally {
      await prisma.$disconnect();
    }
  });

  test('graded submission keeps a disabled control with a clear reason', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      const fixture = await createSubmissionFixture(prisma, e2eContext, {
        graded: true,
      });

      await signIn(e2eContext.userEmail, 'johndoe');
      await page.goto(`/app/documents/${fixture.document.id}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Submissions (1)' }).click();

      const disabledReason = page.getByTestId(
        `student-unsubmit-disabled-reason-${fixture.submission.id}`
      );
      const unsubmitButton = page.getByTestId(
        `student-unsubmit-${fixture.submission.id}`
      );
      await expect(unsubmitButton).toBeDisabled();
      await expect(unsubmitButton).toHaveAttribute(
        'aria-label',
        'Cannot unsubmit graded submission'
      );
      await disabledReason.hover();
      await expect(page.getByRole('tooltip')).toHaveText(GRADED_REASON);
    } finally {
      await prisma.$disconnect();
    }
  });
});
