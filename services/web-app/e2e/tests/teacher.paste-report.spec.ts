import { randomUUID } from 'node:crypto';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

let documentId: string;
let submissionId: string;
let eventId: string;
let deletedEventId: string;
const text = 'same student same other';
test.setTimeout(90000);

test.beforeEach(async ({ e2eContext }) => {
  const prisma = createE2EPrismaClient();
  eventId = `paste_${randomUUID()}`;
  deletedEventId = `paste_${randomUUID()}`;
  try {
    const html = `<p><span data-pasted-source="external" data-paste-event-id="${eventId}">same</span> student <span data-pasted-source="external" data-paste-event-id="${eventId}">same</span> other</p>`;
    const doc = await prisma.document.create({
      data: {
        title: 'Paste report fixture',
        html,
        text,
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        pasteAlerts: {
          create: [
            {
              id: eventId,
              membershipId: e2eContext.membershipId,
              textLength: 240,
              createdAt: new Date('2026-01-02T10:00:00Z'),
            },
            {
              id: deletedEventId,
              membershipId: e2eContext.membershipId,
              textLength: 300,
              createdAt: new Date('2026-01-02T09:00:00Z'),
            },
            {
              membershipId: e2eContext.membershipId,
              textLength: 220,
              createdAt: new Date('2026-01-02T08:00:00Z'),
            },
          ],
        },
        submissions: {
          create: {
            title: 'Paste report submission',
            html,
            text,
            submittedAt: new Date(),
          },
        },
      },
      include: { submissions: true },
    });
    documentId = doc.id;
    submissionId = doc.submissions[0].id;
  } finally {
    await prisma.$disconnect();
  }
});

test.afterEach(async () => {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.submission.deleteMany({ where: { documentId } });
    await prisma.document.delete({ where: { id: documentId } });
  } finally {
    await prisma.$disconnect();
  }
});

for (const view of ['document', 'submission'] as const) {
  test(`teacher reviews events and highlights only surviving spans in ${view}`, async ({
    page,
    e2eContext,
    signIn,
    helpers,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    if (view === 'document')
      await helpers.openDocument(documentId, { retry: true });
    else await page.goto(`/app/submissions/${submissionId}`);
    await page.getByRole('button', { name: 'Pasted text report' }).click();
    await expect(page.getByTestId('paste-report')).toBeVisible();
    await expect(page.getByTestId('paste-report-percentage')).toContainText(
      'At least 34.7%'
    );
    await page.getByTestId(`paste-event-${eventId}`).click();
    await expect(page.getByTestId('paste-highlight')).toHaveCount(2);
    await page.screenshot({ path: `test-results/paste-report-${view}.png` });
    await expect(
      page.getByTestId(`paste-event-${deletedEventId}`)
    ).toContainText('No linked text remains');
    await expect(page.getByTestId('paste-report')).toContainText(
      'Earlier event; position unavailable'
    );
    await page.getByRole('button', { name: 'Comments', exact: true }).click();
    await expect(page.getByTestId('paste-report')).toBeHidden();
    await expect(page.getByTestId('paste-highlight')).toHaveCount(0);
    await expect(
      page.getByText(
        view === 'document' ? 'No comments yet.' : 'No feedback yet',
        { exact: true }
      )
    ).toBeVisible();
  });
}

test('student cannot access the teacher report even for their own document or submission', async ({
  page,
  e2eContext,
  signIn,
  helpers,
}) => {
  await signIn(e2eContext.userEmail, 'johndoe');
  await helpers.openDocument(documentId, { retry: true });
  await expect(
    page.getByRole('button', { name: 'Pasted text report' })
  ).toHaveCount(0);
  for (const query of [
    `documentId=${documentId}`,
    `submissionId=${submissionId}`,
  ]) {
    const response = await page.request.get(
      `/api/teacher-paste-report?${query}`
    );
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain(eventId);
  }
});

test('teacher cannot read events from another class, another organization, or their own work', async ({
  page,
  e2eContext,
  signIn,
}) => {
  const prisma = createE2EPrismaClient();
  const foreignClass = await prisma.class.create({
    data: {
      code: `paste-${randomUUID()}`,
      schoolId: e2eContext.schoolId,
      students: { connect: { id: e2eContext.membershipId } },
    },
  });
  const deployment = await prisma.classAssignment.create({
    data: { classId: foreignClass.id, assignmentId: e2eContext.assignmentId },
  });
  try {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await prisma.document.update({
      where: { id: documentId },
      data: { classAssignmentId: deployment.id },
    });
    for (const query of [
      `documentId=${documentId}`,
      `submissionId=${submissionId}`,
    ]) {
      const response = await page.request.get(
        `/api/teacher-paste-report?${query}`
      );
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain(eventId);
    }
    // A legacy owner from a different organization cannot enter the enrollment fallback.
    const membership = await prisma.orgMembership.findFirstOrThrow({
      where: { organizationId: e2eContext.ua.organizationId, role: 'STUDENT' },
    });
    await prisma.document.update({
      where: { id: documentId },
      data: { classAssignmentId: null, membershipId: membership.id },
    });
    expect(
      (
        await page.request.get(
          `/api/teacher-paste-report?documentId=${documentId}`
        )
      ).status()
    ).toBe(404);
    await prisma.document.update({
      where: { id: documentId },
      data: { membershipId: e2eContext.teacherMembershipId },
    });
    expect(
      (
        await page.request.get(
          `/api/teacher-paste-report?documentId=${documentId}`
        )
      ).status()
    ).toBe(404);
  } finally {
    await prisma.document.update({
      where: { id: documentId },
      data: { classAssignmentId: null, membershipId: e2eContext.membershipId },
    });
    await prisma.classAssignment.delete({ where: { id: deployment.id } });
    await prisma.class.delete({ where: { id: foreignClass.id } });
    await prisma.$disconnect();
  }
});

test('a real paste retains event identity after typing splits it and after saving', async ({
  page,
  e2eContext,
  signIn,
  helpers,
}) => {
  const prisma = createE2EPrismaClient();
  const external = 'Outside quotation with a legitimate source. '.repeat(6);
  try {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await helpers.openDocument(documentId, { retry: true });
    const editor = helpers.getEditor();
    await editor.click();
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+End' : 'Control+End'
    );
    await page.evaluate(
      (text) => navigator.clipboard.writeText(text),
      external
    );
    const posted = page.waitForResponse(
      (response) =>
        response.url().includes('/api/paste-alert') &&
        response.request().method() === 'POST'
    );
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+V' : 'Control+V'
    );
    const response = await posted;
    expect(response.ok()).toBe(true);
    const id = response.request().postDataJSON().eventId as string;
    expect(id).toMatch(/^paste_/);
    await page.evaluate((eventId) => {
      const mark = Array.from(
        document.querySelectorAll('[data-paste-event-id]')
      ).find(
        (element) => element.getAttribute('data-paste-event-id') === eventId
      )!;
      const range = document.createRange();
      range.setStart(mark.firstChild!, 8);
      range.collapse(true);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }, id);
    await page.keyboard.type('MY OWN WORDS');
    await expect(page.locator(`[data-paste-event-id="${id}"]`)).toHaveCount(2);
    await expect
      .poll(
        async () => {
          const doc = await prisma.document.findUniqueOrThrow({
            where: { id: documentId },
            select: { html: true },
          });
          return doc.html?.includes('MY OWN WORDS') && doc.html?.includes(id);
        },
        { timeout: 20000 }
      )
      .toBe(true);
    await page.context().clearCookies();
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await helpers.openDocument(documentId, { retry: true });
    await page.getByRole('button', { name: 'Pasted text report' }).click();
    await page.getByTestId(`paste-event-${id}`).click();
    await expect(page.getByTestId('paste-highlight').first()).toBeVisible();
    const selected = await page
      .getByTestId('paste-highlight-range')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-range-text'))
      );
    // The editor normalizes trailing clipboard whitespace on insertion.
    expect(selected.join('')).toBe(external.trimEnd());
    expect(selected.join('')).not.toContain('MY OWN WORDS');
  } finally {
    await prisma.$disconnect();
  }
});

test('on a phone selecting an event opens its text and keeps the highlight', async ({
  page,
  e2eContext,
  signIn,
  helpers,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  await page.goto(`/app/documents/${documentId}?tab=comments`);
  await page.getByRole('button', { name: 'Pasted text report' }).click();
  await page.getByTestId(`paste-event-${eventId}`).click();
  await expect(
    page.getByRole('tab', { name: 'Editor', exact: true })
  ).toHaveAttribute('data-state', 'active');
  await expect(page.getByTestId('paste-highlight').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/paste-report-mobile.png' });
});

test('submission history includes delayed writes linked in its HTML and excludes later draft events', async ({
  page,
  e2eContext,
  signIn,
}) => {
  const prisma = createE2EPrismaClient();
  const laterId = `paste_${randomUUID()}`;
  try {
    const snapshot = await prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      select: { submittedAt: true },
    });
    const delayedAt = new Date(snapshot.submittedAt.getTime() + 1000);
    await prisma.pasteAlert.update({
      where: { id: eventId },
      data: { createdAt: delayedAt },
    });
    await prisma.pasteAlert.create({
      data: {
        id: laterId,
        documentId,
        membershipId: e2eContext.membershipId,
        textLength: 300,
        createdAt: delayedAt,
      },
    });
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    const response = await page.request.get(
      `/api/teacher-paste-report?submissionId=${submissionId}`
    );
    expect(response.ok()).toBe(true);
    const report = await response.json();
    expect(report.events.map((event: { id: string }) => event.id)).toContain(
      eventId
    );
    expect(
      report.events.map((event: { id: string }) => event.id)
    ).not.toContain(laterId);
  } finally {
    await prisma.$disconnect();
  }
});
