import bcrypt from 'bcryptjs';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

function createPassword(password: string) {
  return { hash: bcrypt.hashSync(password, 10) };
}

async function parseAllStatusCount(page: import('@playwright/test').Page) {
  const allTab = page
    .getByTestId('class-documents-status-chips')
    .getByRole('tab', { name: /^All/i });
  const text = (await allTab.textContent()) ?? '';
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

async function countVisibleDocumentRows(page: import('@playwright/test').Page) {
  const table = page.getByRole('table', { name: /class documents/i });
  await expect(table).toBeVisible();
  return table.locator('tbody tr').count();
}

test.describe('Teacher class documents filter counts', () => {
  test('status tab counts match visible rows when filtering by student', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const documentIds: string[] = [];
    let ericMembershipId = '';

    try {
      const eric = await prisma.user.create({
        data: {
          email: `eric.${suffix}@yawp.test`,
          name: 'Eric Practice',
          password: { create: createPassword('eric-e2e-password') },
          memberships: {
            create: {
              organizationId: e2eContext.organizationId,
              role: 'STUDENT',
              classesAsStudent: { connect: { id: e2eContext.classId } },
            },
          },
        },
        include: { memberships: true },
      });
      ericMembershipId = eric.memberships[0]!.id;

      for (let index = 0; index < 3; index++) {
        const body = `Eric practice doc ${index + 1}`;
        const doc = await prisma.document.create({
          data: {
            title: `Eric Practice ${suffix} ${index + 1}`,
            text: body,
            html: `<p>${body}</p>`,
            membershipId: ericMembershipId,
            assignmentTypeId: e2eContext.assignmentTypeId,
          },
          select: { id: true },
        });
        documentIds.push(doc.id);
      }

      for (let index = 0; index < 2; index++) {
        const body = `Eric class doc ${index + 1}`;
        const doc = await prisma.document.create({
          data: {
            title: `Eric Class ${suffix} ${index + 1}`,
            text: body,
            html: `<p>${body}</p>`,
            membershipId: ericMembershipId,
            assignmentTypeId: e2eContext.assignmentTypeId,
            assignmentId: e2eContext.assignmentId,
            classAssignmentId: e2eContext.classAssignmentId,
            submissions: {
              create: {
                title: `Eric submission ${index + 1}`,
                text: body,
                html: `<p>${body}</p>`,
                submittedAt: new Date(),
              },
            },
          },
          select: { id: true },
        });
        documentIds.push(doc.id);
      }

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.class-documents-view');
      });

      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&documentGroup=none`
      );
      await page.waitForLoadState('networkidle');

      const unfilteredAllCount = await parseAllStatusCount(page);
      const unfilteredRowCount = await countVisibleDocumentRows(page);

      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&documentGroup=none&studentId=${ericMembershipId}`
      );
      await page.waitForLoadState('networkidle');

      const filteredAllCount = await parseAllStatusCount(page);
      const filteredRowCount = await countVisibleDocumentRows(page);

      expect(unfilteredAllCount).toBe(unfilteredRowCount);
      expect(filteredAllCount).toBe(filteredRowCount);
      expect(filteredRowCount).toBe(5);
    } finally {
      if (documentIds.length > 0) {
        await prisma.submission
          .deleteMany({ where: { documentId: { in: documentIds } } })
          .catch(() => {});
        await prisma.document
          .deleteMany({ where: { id: { in: documentIds } } })
          .catch(() => {});
      }
      if (ericMembershipId) {
        await prisma.orgMembership
          .delete({ where: { id: ericMembershipId } })
          .catch(() => {});
      }
      await prisma.$disconnect();
    }
  });
});
