import bcrypt from 'bcryptjs';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import type { E2EContext } from '../seed-e2e';

async function fixture(context: E2EContext) {
  const prisma = createE2EPrismaClient();
  const suffix = Date.now().toString(36);
  const schoolYear = await prisma.class.findUniqueOrThrow({
    where: { id: context.classId },
    select: { schoolYear: true },
  });
  const classroom = await prisma.class.create({
    data: {
      schoolId: context.schoolId,
      schoolYear: schoolYear.schoolYear,
      title: `Navigation ${suffix}`,
      code: `NAV-${suffix}`,
      teachers: { connect: { id: context.teacherMembershipId } },
    },
  });
  const { assignment, classAssignment } = await createDeployedAssignment({
    prisma,
    classId: classroom.id,
    assignmentTypeId: context.assignmentTypeId,
    title: `Navigation assignment ${suffix}`,
    prompt: 'Explain your argument.',
    pointValue: 100,
  });
  const entries: Array<{
    name: string;
    submissionId: string;
    documentId: string;
    title: string;
  }> = [];
  let anaEmail = '';
  for (const [index, name] of [
    'Ana Queue',
    'Ben Queue',
    'Cara Queue',
  ].entries()) {
    const email = `${name.split(' ')[0]}.${suffix}@yawp.test`;
    if (index === 0) anaEmail = email;
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: {
          create: { hash: bcrypt.hashSync('student-e2e-password', 10) },
        },
        memberships: {
          create: {
            organizationId: context.organizationId,
            role: 'STUDENT',
            classesAsStudent: { connect: { id: classroom.id } },
          },
        },
      },
      include: { memberships: true },
    });
    for (let paper = 0; paper < (index === 0 ? 2 : 1); paper++) {
      const title = `${name} paper ${paper + 1}`;
      const body = `Distinct essay content: ${title}.`;
      const document = await prisma.document.create({
        data: {
          title,
          text: body,
          html: `<p>${body}</p>`,
          membershipId: user.memberships[0].id,
          assignmentTypeId: context.assignmentTypeId,
          assignmentId: assignment.id,
          classAssignmentId: classAssignment.id,
          submissions: {
            create: {
              title,
              text: body,
              html: `<p>${body}</p>`,
              submittedAt: new Date(),
            },
          },
        },
        include: { submissions: true },
      });
      entries.push({
        name,
        title,
        documentId: document.id,
        submissionId: document.submissions[0].id,
      });
    }
  }
  await prisma.$disconnect();
  return { classroom, assignment, entries, anaEmail };
}

test('dropdown and arrows preserve the class queue and protect unsaved grading', async ({
  page,
  e2eContext,
  signIn,
}, testInfo) => {
  const { classroom, entries } = await fixture(e2eContext);
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  const exitTo = `/app/my-classes/${classroom.id}?tab=documents&status=needs-grading`;
  const initial = `/app/submissions/${entries[0].submissionId}?exitTo=${encodeURIComponent(exitTo)}&queueSort=student%3Aasc`;
  await page.goto(initial);
  const picker = page.getByRole('combobox', {
    name: 'Choose ungraded submission',
  });
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue(entries[0].submissionId);
  await expect(picker.locator('option')).toHaveCount(4);
  await expect(picker).toContainText('Ana Queue paper 1');
  await expect(picker).toContainText('Ana Queue paper 2');
  await expect(page.getByTestId('grading-queue-previous')).toBeDisabled();
  await page.getByTestId('grading-queue-next').click();
  await expect(picker).toHaveValue(entries[1].submissionId);
  await expect(
    page.getByText(`Distinct essay content: ${entries[1].title}.`, {
      exact: true,
    })
  ).toBeVisible();

  await page
    .getByTestId('grading-overall-comment')
    .fill('Unsaved feedback must not disappear.');
  await picker.selectOption(entries[3].submissionId);
  const guard = page.getByRole('alertdialog', {
    name: 'Unsaved grading changes',
  });
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByTestId('grading-overall-comment')).toHaveValue(
    'Unsaved feedback must not disappear.'
  );
  await picker.selectOption(entries[3].submissionId);
  await guard.getByRole('button', { name: 'Discard and continue' }).click();
  await expect(picker).toHaveValue(entries[3].submissionId);
  await expect(page.getByTestId('grading-overall-comment')).toHaveValue('');
  await expect(page.getByTestId('grading-queue-next')).toBeDisabled();
  expect(new URL(page.url()).searchParams.get('exitTo')).toBe(exitTo);
  expect(new URL(page.url()).searchParams.get('queueSort')).toBe('student:asc');

  // Grading changes the current row's status; it stays as an honest current
  // item, and the remaining queue still leads to the right documents.
  await page.getByTestId('grading-overall-points').fill('88');
  await page.getByTestId('submission-lifecycle-save').click();
  await expect(page.getByTestId('submission-lifecycle-release')).toBeVisible();
  await expect(picker).toHaveValue(entries[3].submissionId);
  await expect(picker.locator('option:checked')).toContainText('Current');
  await page.getByTestId('grading-queue-previous').click();
  await expect(picker).toHaveValue(entries[2].submissionId);
  await expect(picker.locator('option')).toHaveCount(3);
  await expect(page.getByTestId('grading-overall-comment')).toHaveValue('');
  await expect(page.getByTestId('submission-lifecycle-save')).toBeDisabled();
  await expect(page.getByTestId('submission-lifecycle-release')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('grading-queue.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/app/my-classes/${classroom.id}\\?`)
  );
  // Enter again from the actual work list: its live column order travels with
  // the selected document, alongside the existing filters/exit URL.
  await page
    .getByRole('button', { name: 'Sort by Student ascending', exact: true })
    .click();
  await page.getByRole('row').filter({ hasText: entries[0].title }).click();
  await expect(picker).toHaveValue(entries[0].submissionId);
  expect(new URL(page.url()).searchParams.get('queueSort')).toBe('student:asc');
  expect(
    new URL(
      new URL(page.url()).searchParams.get('exitTo')!,
      'http://yawp.test'
    ).searchParams.get('status')
  ).toBe('needs-grading');
});

test('queue stays private for students and active for teachers without a rollout flag', async ({
  page,
  e2eContext,
  signIn,
}) => {
  const { classroom, entries, anaEmail } = await fixture(e2eContext);
  const target = `/app/submissions/${entries[0].submissionId}?exitTo=${encodeURIComponent(`/app/my-classes/${classroom.id}?tab=documents&status=needs-grading`)}`;
  await signIn(anaEmail, 'student-e2e-password');
  await page.goto(target);
  await expect(page.getByTestId('grading-queue-nav')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Ben Queue');
  await expect(page.locator('body')).not.toContainText('Cara Queue');
  await page.context().clearCookies();
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  await page.goto(target);
  await expect(page.getByTestId('grading-queue-nav')).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Choose ungraded submission' })
  ).toContainText('Ben Queue');
});

test('migration removes the organization rollout control from schema and admin settings', async ({
  page,
  e2eContext,
  signIn,
}) => {
  const prisma = createE2EPrismaClient();
  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Organization' AND column_name = 'gradingQueueNavEnabled'`;
    expect(columns).toEqual([]);

    await signIn(e2eContext.adminEmail, 'admin-e2e-password');
    await page.goto(`/app/admin/organizations/${e2eContext.organizationId}`);
    await page
      .getByRole('button', { name: 'Edit Organization', exact: true })
      .click();
    const settings = page.getByRole('dialog');
    await expect(settings.locator('input[name="gradingQueueNavEnabled"]')).toHaveCount(0);
    await expect(settings).not.toContainText('Grading queue navigation');
  } finally {
    await prisma.$disconnect();
  }
});
