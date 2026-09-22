import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Documents table horizontal scroll', () => {
  test('scrolls horizontally at narrow widths and never clips the status badge', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const submissionTitle = `Horizontal scroll submission ${suffix}`;
    let documentId = '';

    try {
      const document = await prisma.document.create({
        data: {
          title: `Horizontal scroll doc ${suffix}`,
          text: 'Horizontal scroll body',
          html: '<p>Horizontal scroll body</p>',
          membership: { connect: { id: e2eContext.membershipId } },
          assignmentType: { connect: { id: e2eContext.assignmentTypeId } },
          submissions: {
            create: {
              title: submissionTitle,
              text: 'Horizontal scroll body',
              html: '<p>Horizontal scroll body</p>',
              submittedAt: new Date(),
            },
          },
        },
        select: { id: true },
      });
      documentId = document.id;

      await page.setViewportSize({ width: 900, height: 900 });
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/documents?status=needs-grading');
      await page.waitForLoadState('networkidle');

      const table = page.getByRole('table', { name: 'Documents' });
      await expect(table).toBeVisible();

      // The table is wider than its container, and the container is the thing
      // that scrolls — the page body must not scroll sideways.
      const overflow = await table.evaluate((element) => {
        const container = element.parentElement as HTMLElement;
        const containerStyle = window.getComputedStyle(container);
        return {
          tableWidth: element.scrollWidth,
          containerWidth: container.clientWidth,
          containerScrollWidth: container.scrollWidth,
          overflowX: containerStyle.overflowX,
          bodyOverflows:
            window.document.documentElement.scrollWidth >
            window.document.documentElement.clientWidth,
        };
      });

      expect(overflow.overflowX).toMatch(/auto|scroll/);
      expect(overflow.tableWidth).toBeGreaterThan(overflow.containerWidth);
      expect(overflow.containerScrollWidth).toBeGreaterThan(
        overflow.containerWidth
      );
      expect(overflow.bodyOverflows).toBe(false);

      // The status badge renders its full label — no ellipsis, no clipping.
      const row = page.getByRole('row', { name: new RegExp(submissionTitle) });
      await expect(row).toBeVisible();

      const statusCell = row.getByTestId('document-status-cell');
      await expect(statusCell).toBeVisible();

      const statusClipped = await statusCell.evaluate((element) => {
        const cell = element as HTMLElement;
        const badge = cell.querySelector('span, div');
        return {
          cell: cell.scrollWidth > cell.clientWidth + 1,
          badge: badge ? badge.scrollWidth > badge.clientWidth + 1 : false,
          label: cell.innerText.trim(),
        };
      });
      expect(statusClipped.cell).toBe(false);
      expect(statusClipped.badge).toBe(false);
      expect(statusClipped.label.length).toBeGreaterThan(0);

      // Scrolling the container right reveals the trailing columns.
      await table.evaluate((element) => {
        const container = element.parentElement as HTMLElement;
        container.scrollLeft = container.scrollWidth;
      });

      const scrolledLeft = await table.evaluate(
        (element) => (element.parentElement as HTMLElement).scrollLeft
      );
      expect(scrolledLeft).toBeGreaterThan(0);
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
