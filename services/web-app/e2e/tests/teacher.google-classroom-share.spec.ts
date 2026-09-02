import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const TEACHER_EMAIL = 'teacher.e2e@yawp.test';
const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';

async function setGoogleClassroomEnabled(
  organizationId: string,
  enabled: boolean
) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { googleClassroomEnabled: enabled },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function readShareToken(classAssignmentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    const link = await prisma.classAssignmentShareLink.findUnique({
      where: { classAssignmentId },
      select: { token: true, revokedAt: true },
    });
    return link;
  } finally {
    await prisma.$disconnect();
  }
}

async function clearShareLink(classAssignmentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.classAssignmentShareLink.deleteMany({
      where: { classAssignmentId },
    });
  } finally {
    await prisma.$disconnect();
  }
}

const assignmentUrl = (classId: string, assignmentId: string) =>
  `/app/my-classes/${classId}/assignments/${assignmentId}`;

test.describe('teacher shares an assignment to Google Classroom', () => {
  test.afterEach(async ({ e2eContext }) => {
    // The gate is off for everyone by default; leave the shared E2E org the way
    // the other specs expect to find it.
    await setGoogleClassroomEnabled(e2eContext.organizationId, false);
    await clearShareLink(e2eContext.classAssignmentId);
  });

  test('the share control stays hidden while the rollout gate is off', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setGoogleClassroomEnabled(e2eContext.organizationId, false);
    await signIn(TEACHER_EMAIL, TEACHER_PASSWORD);
    await page.goto(
      assignmentUrl(e2eContext.classId, e2eContext.assignmentId)
    );

    await expect(
      page.getByRole('button', { name: /share to google classroom/i })
    ).toHaveCount(0);
  });

  test('sharing hands Google a launch URL for this assignment', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setGoogleClassroomEnabled(e2eContext.organizationId, true);
    await clearShareLink(e2eContext.classAssignmentId);
    await signIn(TEACHER_EMAIL, TEACHER_PASSWORD);
    await page.goto(
      assignmentUrl(e2eContext.classId, e2eContext.assignmentId)
    );

    const shareButton = page.getByRole('button', {
      name: /share to google classroom/i,
    });
    await expect(shareButton).toBeVisible();

    // Post the form the way the browser would, but stop at the redirect rather
    // than following it out to classroom.google.com: the assertion worth making
    // is what YAWP hands Google, not that Google is up.
    const response = await page.request.post('/api/classroom/share', {
      form: { classAssignmentId: e2eContext.classAssignmentId },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(302);
    const location = new URL(response.headers()['location']);
    expect(`${location.origin}${location.pathname}`).toBe(
      'https://classroom.google.com/share'
    );
    expect(location.searchParams.get('itemtype')).toBe('assignment');

    const link = await readShareToken(e2eContext.classAssignmentId);
    expect(link).not.toBeNull();
    expect(location.searchParams.get('url')).toContain(
      `/classroom/launch/${link!.token}`
    );
  });

  test('sharing twice reuses the link Classroom already holds', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setGoogleClassroomEnabled(e2eContext.organizationId, true);
    await clearShareLink(e2eContext.classAssignmentId);
    await signIn(TEACHER_EMAIL, TEACHER_PASSWORD);
    await page.goto(
      assignmentUrl(e2eContext.classId, e2eContext.assignmentId)
    );

    await page.request.post('/api/classroom/share', {
      form: { classAssignmentId: e2eContext.classAssignmentId },
      maxRedirects: 0,
    });
    const first = await readShareToken(e2eContext.classAssignmentId);

    await page.request.post('/api/classroom/share', {
      form: { classAssignmentId: e2eContext.classAssignmentId },
      maxRedirects: 0,
    });
    const second = await readShareToken(e2eContext.classAssignmentId);

    // A teacher who re-shares must not silently break the URL already posted
    // into last week's Classroom assignment.
    expect(second!.token).toBe(first!.token);
  });

  test('the launch link takes an enrolled student to their assignments', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setGoogleClassroomEnabled(e2eContext.organizationId, true);
    await clearShareLink(e2eContext.classAssignmentId);

    await signIn(TEACHER_EMAIL, TEACHER_PASSWORD);
    await page.request.post('/api/classroom/share', {
      form: { classAssignmentId: e2eContext.classAssignmentId },
      maxRedirects: 0,
    });
    const link = await readShareToken(e2eContext.classAssignmentId);
    await page.context().clearCookies();

    // The student arrives from Classroom, signs in, and should land in the app
    // rather than on an error.
    await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
    await page.goto(`/classroom/launch/${link!.token}`);

    await expect(page).toHaveURL(
      new RegExp(`/app/my-classes/${e2eContext.classId}\\?tab=assignments`)
    );
  });

  test('an unknown launch token 404s instead of leaking that it is wrong', async ({
    page,
    signIn,
  }) => {
    await signIn(TEACHER_EMAIL, TEACHER_PASSWORD);

    const response = await page.request.get(
      '/classroom/launch/not-a-real-token',
      { maxRedirects: 0 }
    );

    expect(response.status()).toBe(404);
  });
});
