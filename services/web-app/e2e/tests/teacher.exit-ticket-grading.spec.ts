import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import type { E2EContext } from '../seed-e2e';

/**
 * Exit Tickets run two grading behaviors on one rubric: an open-ended
 * reflection, and a check for understanding with a right answer. Each is
 * walked here from start to finish — the teacher creates a graded ticket in
 * the creation sheet, a student's answer is submitted, the Grading Assistant
 * grades it on the Exit Ticket bands, the teacher enters a whole number of
 * points, and the gradebook shows what was saved.
 */

const TEACHER_PASSWORD = 'teacher-e2e-password';
const CORRECT_ANSWER =
  'Weathering breaks rock down in place; erosion carries the pieces away.';

async function openNewExitTicket(page: Page, e2eContext: E2EContext) {
  await page.goto(
    `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
  );
  await page.getByRole('button', { name: /^New/ }).click();
  await page.getByRole('menuitem', { name: 'Assignment' }).click();
  await expect(
    page.getByRole('heading', { name: 'New Assignment' })
  ).toBeVisible();
  await page.getByRole('checkbox', { name: /Grade 9th/ }).check();
}

async function createdAssignment(title: string) {
  const prisma = createE2EPrismaClient();
  try {
    return await expect
      .poll(
        async () =>
          prisma.assignment.findFirst({
            where: { title },
            select: {
              id: true,
              pointValue: true,
              exitTicketConfigJson: true,
              classAssignments: { select: { id: true, classId: true } },
            },
          }),
        { timeout: 30_000 }
      )
      .not.toBeNull()
      .then(() =>
        prisma.assignment.findFirstOrThrow({
          where: { title },
          select: {
            id: true,
            pointValue: true,
            exitTicketConfigJson: true,
            classAssignments: { select: { id: true, classId: true } },
          },
        })
      );
  } finally {
    await prisma.$disconnect();
  }
}

async function submitAnswer(
  e2eContext: E2EContext,
  assignment: { id: string; classAssignments: { id: string }[] },
  text: string
) {
  const prisma = createE2EPrismaClient();
  try {
    const document = await prisma.document.create({
      data: {
        title: `Exit ticket answer ${assignment.id}`,
        text,
        html: `<p>${text}</p>`,
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.exitTicketAssignmentTypeId,
        assignmentId: assignment.id,
        classAssignmentId: assignment.classAssignments[0]!.id,
      },
      select: { id: true },
    });
    const submission = await prisma.submission.create({
      data: {
        documentId: document.id,
        html: `<p>${text}</p>`,
        text,
        title: `Exit ticket answer ${assignment.id}`,
        submittedAt: new Date(),
      },
      select: { id: true },
    });
    return { documentId: document.id, submissionId: submission.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function gradeAndRecord(
  page: Page,
  e2eContext: E2EContext,
  {
    assignmentId,
    submissionId,
    teacherPoints,
  }: { assignmentId: string; submissionId: string; teacherPoints: number }
) {
  await page.goto(`/app/submissions/${submissionId}`);
  await page.waitForLoadState('networkidle');

  const graded = page.waitForResponse(
    (response) =>
      response.url().includes('/api/domain/grade-essay-ai') &&
      response.request().method() === 'POST',
    { timeout: 60_000 }
  );
  await page.getByTestId('grading-assistant-generate').click();
  expect((await graded).status()).toBe(200);

  // One category, read on the Exit Ticket bands; the assistant's 100 is the
  // whole 10-point ticket.
  await expect(
    page.getByRole('button', { name: /^Understanding/ })
  ).toContainText('Explains it', { timeout: 30_000 });
  const scoreInput = page.getByTestId('grading-overall-scale-score');
  await expect(scoreInput).toHaveValue('10');

  const prisma = createE2EPrismaClient();
  try {
    const afterAssistant = await prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      select: { rubricScores: true, score: true, grammarIssues: true },
    });
    expect(afterAssistant.rubricScores).toMatchObject({
      understanding: { score: 100, isAi: true },
    });
    expect(afterAssistant.score).toBe('100/100');
    expect(afterAssistant.grammarIssues).toEqual({ version: 1, issues: [] });

    // The teacher's score field keeps the whole number they type.
    await scoreInput.fill(String(teacherPoints));
    await scoreInput.blur();
    await expect(scoreInput).toHaveValue(String(teacherPoints));
    await page.getByTestId('submission-lifecycle-save').click();
    await expect
      .poll(
        async () =>
          (
            await prisma.submission.findUniqueOrThrow({
              where: { id: submissionId },
              select: { score: true },
            })
          ).score,
        { timeout: 60_000 }
      )
      .toBe(`${teacherPoints}/10`);
  } finally {
    await prisma.$disconnect();
  }

  await page.goto(
    `/app/my-classes/${e2eContext.classId}/assignments/${assignmentId}?status=graded`
  );
  await expect(
    page.getByRole('row', { name: new RegExp(`Exit ticket answer ${assignmentId}`) })
  ).toContainText(new RegExp(`${teacherPoints}\\s*/\\s*10`));
}

async function deleteDocument(documentId: string | null) {
  if (!documentId) return;
  const prisma = createE2EPrismaClient();
  try {
    await prisma.document
      .delete({ where: { id: documentId } })
      .catch(() => undefined);
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Exit Ticket grading, start to finish', () => {
  test('a graded reflection (open-ended) is graded and recorded', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    test.setTimeout(180_000);
    const title = `Graded reflection ${Date.now()}`;
    let documentId: string | null = null;
    try {
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await openNewExitTicket(page, e2eContext);
      await expect(page.getByRole('radio', { name: /^Reflection/ })).toBeChecked();
      await page.getByLabel('Grade this ticket').check();
      await page.getByLabel('How many points?').fill('10');
      await page.getByLabel('Title (optional)').fill(title);
      await page.getByRole('button', { name: /Create Assignment/i }).click();
      await expect(
        page.getByRole('heading', { name: 'New Assignment' })
      ).toHaveCount(0);

      const assignment = await createdAssignment(title);
      expect(assignment.pointValue).toBe(10);
      expect(assignment.exitTicketConfigJson).toMatchObject({
        mode: 'basic',
        kind: 'reflection',
        grading: { basis: 'completion' },
      });

      const answer = await submitAnswer(
        e2eContext,
        assignment,
        'Today I learned that weathering and erosion are different. I am still wondering how fast erosion happens in a river.'
      );
      documentId = answer.documentId;
      await gradeAndRecord(page, e2eContext, {
        assignmentId: assignment.id,
        submissionId: answer.submissionId,
        teacherPoints: 9,
      });
    } finally {
      await deleteDocument(documentId);
    }
  });

  test('a graded check for understanding (correct answer) is graded and recorded', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    test.setTimeout(180_000);
    const title = `Graded check ${Date.now()}`;
    let documentId: string | null = null;
    try {
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await openNewExitTicket(page, e2eContext);
      await page
        .getByRole('radio', { name: /^Check for understanding/ })
        .click();
      await page.getByLabel('What are you checking for?').click();
      await page.getByRole('option', { name: 'Explain a concept' }).click();
      await page
        .getByLabel('What specifically?')
        .fill('the difference between weathering and erosion');
      await page.getByRole('radio', { name: /^Yes/ }).click();
      await page.getByLabel('Grade this ticket').check();
      await page.getByLabel('How many points?').fill('10');
      await page
        .getByLabel('Correct answer or key points')
        .fill(CORRECT_ANSWER);
      await page.getByLabel('Title (optional)').fill(title);
      await page.getByRole('button', { name: /Create Assignment/i }).click();
      await expect(
        page.getByRole('heading', { name: 'New Assignment' })
      ).toHaveCount(0);

      const assignment = await createdAssignment(title);
      expect(assignment.pointValue).toBe(10);
      expect(assignment.exitTicketConfigJson).toMatchObject({
        mode: 'specific',
        kind: 'check',
        answerType: 'objective',
        lessonNotes: { mustMention: CORRECT_ANSWER },
        grading: { basis: 'bands' },
      });

      const answer = await submitAnswer(
        e2eContext,
        assignment,
        'Weathering is when rock breaks down where it is. Erosion is when water or wind moves the broken pieces somewhere else.'
      );
      documentId = answer.documentId;
      await gradeAndRecord(page, e2eContext, {
        assignmentId: assignment.id,
        submissionId: answer.submissionId,
        teacherPoints: 4,
      });
    } finally {
      await deleteDocument(documentId);
    }
  });
});
