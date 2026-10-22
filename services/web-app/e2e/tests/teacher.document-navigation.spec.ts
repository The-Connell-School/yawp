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
      title: `Doc nav ${suffix}`,
      code: `DNAV-${suffix}`,
      teachers: { connect: { id: context.teacherMembershipId } },
    },
  });
  const { assignment, classAssignment } = await createDeployedAssignment({
    prisma,
    classId: classroom.id,
    assignmentTypeId: context.assignmentTypeId,
    title: `Doc nav assignment ${suffix}`,
    prompt: 'Respond to the prompt in your own words.',
    pointValue: 100,
  });
  const entries: Array<{
    label: string;
    documentId: string;
    submissionId: string | null;
    marker: string;
  }> = [];
  for (const [index, label] of ['Student Alpha', 'Student Beta', 'Student Gamma'].entries()) {
    const email = `docnav.${index}.${suffix}@yawp.test`;
    const user = await prisma.user.create({
      data: {
        name: label,
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
    const marker = `Marker ${label} ${suffix}`;
    const body = `<p>${marker}</p>`;
    const withSubmission = index !== 0;
    const document = await prisma.document.create({
      data: {
        title: `${label} draft`,
        text: marker,
        html: body,
        membershipId: user.memberships[0].id,
        assignmentTypeId: context.assignmentTypeId,
        assignmentId: assignment.id,
        classAssignmentId: classAssignment.id,
        ...(withSubmission
          ? {
              submissions: {
                create: {
                  title: `${label} submission`,
                  text: marker,
                  html: body,
                  submittedAt: new Date(),
                },
              },
            }
          : {}),
      },
      include: { submissions: true },
    });
    entries.push({
      label,
      documentId: document.id,
      submissionId: document.submissions[0]?.id ?? null,
      marker,
    });
  }
  await prisma.$disconnect();
  return { entries, exitTo: '/app/documents?status=all' };
}

test('document view student navigator moves through the documents queue', async ({
  page,
  e2eContext,
  signIn,
}) => {
  const { entries, exitTo } = await fixture(e2eContext);
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  const first = entries[0];
  const second = entries[1];
  const start = `/app/documents/${first.documentId}?left=tutor&exitTo=${encodeURIComponent(exitTo)}&queueSort=student%3Aasc`;
  await page.goto(start);
  const nav = page.getByTestId('document-navigation');
  await expect(nav).toBeVisible();
  await expect(page.getByTestId('document-navigation-select')).toHaveValue(
    first.documentId
  );
  await expect(page.getByTestId('document-navigation-position')).toHaveText(
    '1 of 3'
  );
  await expect(page.locator('.ProseMirror')).toContainText(first.marker);
  await page.getByTestId('document-navigation-next').click();
  await expect(page).toHaveURL(
    new RegExp(`/app/documents/${second.documentId}`)
  );
  await expect(page.getByTestId('document-navigation-select')).toHaveValue(
    second.documentId
  );
  await expect(page.getByTestId('document-navigation-position')).toHaveText(
    '2 of 3'
  );
  await expect(page.locator('.ProseMirror')).toContainText(second.marker);
  await page.getByTestId('document-navigation-select').selectOption(
    entries[2].documentId
  );
  await expect(page).toHaveURL(
    new RegExp(`/app/documents/${entries[2].documentId}`)
  );
  await expect(page.locator('.ProseMirror')).toContainText(entries[2].marker);
  await page.getByTestId('document-navigation-previous').click();
  await expect(page.getByTestId('document-navigation-select')).toHaveValue(
    second.documentId
  );
  await expect(page.getByTestId('document-navigation-next')).toBeEnabled();
  await page.getByTestId('document-navigation-previous').click();
  await expect(page.getByTestId('document-navigation-previous')).toBeDisabled();
});

test('submission view student navigator from the Documents queue', async ({
  page,
  e2eContext,
  signIn,
}) => {
  const { entries, exitTo } = await fixture(e2eContext);
  const submitted = entries.filter((entry) => entry.submissionId != null);
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  const start = `/app/submissions/${submitted[0].submissionId}?edit=1&exitTo=${encodeURIComponent(exitTo)}&queueSort=student%3Aasc`;
  await page.goto(start);
  await expect(page.getByTestId('document-navigation')).toBeVisible();
  const picker = page.getByTestId('document-navigation-select');
  await expect(picker).toHaveValue(submitted[0].documentId);
  await page.getByTestId('document-navigation-next').click();
  await expect(page).toHaveURL(
    new RegExp(`/app/submissions/${submitted[1].submissionId}`)
  );
  await expect(picker).toHaveValue(submitted[1].documentId);
  await expect(page.locator('.submission-essay, .ProseMirror').first()).toContainText(
    submitted[1].marker
  );
  await picker.selectOption(submitted[0].documentId);
  await expect(page).toHaveURL(
    new RegExp(`/app/submissions/${submitted[0].submissionId}`)
  );
});
