import { randomUUID } from 'node:crypto';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

let documentId: string;
let submissionId: string;
let eventId: string;
let deletedEventId: string;
const text = 'same student same other';

test.beforeEach(async ({ e2eContext }) => {
  const prisma = createE2EPrismaClient();
  eventId = `paste_${randomUUID()}`; deletedEventId = `paste_${randomUUID()}`;
  try {
    const html = `<p><span data-pasted-source="external" data-paste-event-id="${eventId}">same</span> student <span data-pasted-source="external" data-paste-event-id="${eventId}">same</span> other</p>`;
    const doc = await prisma.document.create({ data: {
      title: 'Paste report fixture', html, text,
      membershipId: e2eContext.membershipId, assignmentTypeId: e2eContext.assignmentTypeId,
      pasteAlerts: { create: [
        { id: eventId, membershipId: e2eContext.membershipId, textLength: 240, createdAt: new Date('2026-01-02T10:00:00Z') },
        { id: deletedEventId, membershipId: e2eContext.membershipId, textLength: 300, createdAt: new Date('2026-01-02T09:00:00Z') },
        { membershipId: e2eContext.membershipId, textLength: 220, createdAt: new Date('2026-01-02T08:00:00Z') },
      ] },
      submissions: { create: { title: 'Paste report submission', html, text, submittedAt: new Date() } },
    }, include: { submissions: true } });
    documentId = doc.id; submissionId = doc.submissions[0].id;
  } finally { await prisma.$disconnect(); }
});

test.afterEach(async () => {
  const prisma = createE2EPrismaClient();
  try { await prisma.document.delete({ where: { id: documentId } }); }
  finally { await prisma.$disconnect(); }
});

for (const view of ['document', 'submission'] as const) {
  test(`teacher reviews events and highlights only surviving spans in ${view}`, async ({ page, e2eContext, signIn, helpers }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    if (view === 'document') await helpers.openDocument(documentId, { retry: true });
    else await page.goto(`/app/submissions/${submissionId}`);
    await page.getByRole('button', { name: 'Pasted text report' }).click();
    await expect(page.getByTestId('paste-report')).toBeVisible();
    await expect(page.getByTestId('paste-report-percentage')).toContainText('At least 36.3%');
    await page.getByTestId(`paste-event-${eventId}`).click();
    await expect(page.locator('[data-paste-selected="true"]')).toHaveCount(2);
    await expect(page.getByTestId(`paste-event-${deletedEventId}`)).toContainText('No matching text remains');
    await expect(page.getByTestId('paste-report')).toContainText('Earlier event; position unavailable');
    await page.getByRole('button', { name: 'Comments', exact: true }).click();
    await expect(page.getByTestId('paste-report')).toBeHidden();
    await expect(page.locator('[data-paste-selected="true"]')).toHaveCount(0);
    await expect(page.getByText(view === 'document' ? 'No comments yet.' : 'No feedback yet', { exact: true })).toBeVisible();
  });
}

test('student cannot access the teacher report even for their own document or submission', async ({ page, e2eContext, signIn, helpers }) => {
  await signIn(e2eContext.userEmail, 'johndoe');
  await helpers.openDocument(documentId, { retry: true });
  await expect(page.getByRole('button', { name: 'Pasted text report' })).toHaveCount(0);
  for (const query of [`documentId=${documentId}`, `submissionId=${submissionId}`]) {
    const response = await page.request.get(`/api/teacher-paste-report?${query}`);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain(eventId);
  }
});
