import { test, expect } from '../test-setup';
import { mkdir, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import bcrypt from 'bcryptjs';
import { generateStudentJoinToken } from '../../app/utils/student-join-token';

test('existing student joins a separate free classroom and retains access after reload', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const db = createE2EPrismaClient();
  const tag = `enter-code-${Date.now()}`;
  const orgs: string[] = [],
    users: string[] = [];
  const handle = `local${Date.now().toString(36)}`;
  const joinToken = generateStudentJoinToken();
  let assignmentId: string | undefined;
  const shots = process.env.QA_SCREENSHOT_DIR;
  const sourceSha =
    process.env.SOURCE_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  page.on('response', (response) => {
    if (
      response.request().method() === 'POST' &&
      response.url().includes('/enter-code')
    )
      console.log(`enter-code status: ${response.status()}`);
  });
  const shot = async (name: string) => {
    if (!shots) return;
    await mkdir(shots, { recursive: true });
    await page.screenshot({
      path: `${shots}/${name}.png`,
      fullPage: true,
      mask: [page.locator('input[name="code"]')],
    });
    await appendFile(
      `${shots}/manifest.jsonl`,
      JSON.stringify({
        sourceSha,
        file: `${name}.png`,
        url: page.url(),
        viewport: page.viewportSize(),
        capturedAt: new Date().toISOString(),
        fixture:
          'Disposable local PostgreSQL identities/classes; ordinary UI; codes masked and fixtures deleted in finally.',
      }) + '\n'
    );
  };
  try {
    const source = await db.organization.create({ data: { name: tag } });
    orgs.push(source.id);
    const target = await db.organization.create({
      data: { name: tag, plan: 'FREE_CLASSROOM' },
    });
    orgs.push(target.id);
    const student = await db.user.create({
      data: {
        email: `${tag}@yawp.local`,
        name: 'Local Existing Student',
        password: {
          create: { hash: await bcrypt.hash('local-fixture-pass', 4) },
        },
      },
    });
    users.push(student.id);
    const teacher = await db.user.create({
      data: { email: `${tag}-teacher@yawp.local`, name: 'Local Free Teacher' },
    });
    users.push(teacher.id);
    const prior = await db.orgMembership.create({
      data: { userId: student.id, organizationId: source.id, role: 'STUDENT' },
    });
    const teacherMember = await db.orgMembership.create({
      data: {
        userId: teacher.id,
        organizationId: target.id,
        role: 'TEACHER',
        isOrgOwner: true,
      },
    });
    await db.freeTierApplication.create({
      data: {
        name: tag,
        email: `${tag}-teacher@yawp.local`,
        schoolName: 'Local classroom',
        location: 'Local',
        gradeLevel: '10',
        userId: teacher.id,
        organizationId: target.id,
        status: 'APPROVED',
      },
    });
    const school = await db.school.create({
      data: {
        name: 'Local Free Classroom',
        code: tag,
        organizationId: target.id,
      },
    });
    const klass = await db.class.create({
      data: {
        schoolId: school.id,
        code: tag,
        studentJoinToken: joinToken,
        title: 'Local Joined Class',
        teachers: { connect: { id: teacherMember.id } },
      },
    });
    const kind = await db.assignmentType.findFirstOrThrow({
      where: { kind: 'class_starter' },
    });
    await db.organizationAssignmentType.create({
      data: { organizationId: target.id, assignmentTypeId: kind.id },
    });
    const deployed = await createDeployedAssignment({
      prisma: db,
      classId: klass.id,
      assignmentTypeId: kind.id,
      title: 'Local Permitted Assignment',
      prompt: 'Write a local fixture paragraph.',
    });
    assignmentId = deployed.assignment.id;
    const priorSchool = await db.school.create({
      data: {
        name: 'Local Prior Classroom',
        code: `${tag}-prior`,
        organizationId: source.id,
      },
    });
    const priorClass = await db.class.create({
      data: {
        schoolId: priorSchool.id,
        code: `${tag}-prior`,
        title: 'Local Prior Class',
      },
    });
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel(/email or handle/i).fill(student.email!);
    await page
      .getByLabel('Password', { exact: true })
      .fill('local-fixture-pass');
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL(/enter-code|\/app/);
    await page.goto('/enter-code');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Class Code', { exact: true }).fill(priorClass.code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/app(?:\?|$)/);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Local Prior Class', exact: true })
    ).toBeVisible();
    await shot('desktop-same-organization-control');
    const collisionOrg = await db.organization.create({
      data: { name: 'Unrelated Tenant', plan: 'FREE_CLASSROOM' },
    });
    orgs.push(collisionOrg.id);
    const collisionSchool = await db.school.create({
      data: {
        name: 'Unrelated Tenant Classroom',
        code: `${tag}-collision`,
        organizationId: collisionOrg.id,
      },
    });
    const collision = await db.class.create({
      data: {
        schoolId: collisionSchool.id,
        code: klass.code,
        title: 'Unrelated Tenant Class',
      },
    });
    await page.goto('/enter-code');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Class Code', { exact: true }).fill(klass.code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByText('Invalid code.', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('Unrelated Tenant Class')).toHaveCount(0);
    await shot('desktop-collision-denial');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('mobile-collision-denial');
    expect(
      await db.orgMembership.count({ where: { userId: student.id } })
    ).toBe(1);
    await db.class.update({
      where: { id: collision.id },
      data: { isArchived: true },
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/enter-code');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Class Code', { exact: true }).fill(klass.code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    if (process.env.CAPTURE_REJECTION === '1') {
      await expect(
        page.getByText('Invalid code.', { exact: true })
      ).toBeVisible();
      await shot('desktop-rejection');
      await page.setViewportSize({ width: 390, height: 844 });
      await shot('mobile-rejection');
    }
    await expect(page).toHaveURL(/\/app(?:\?|$)/);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Local Joined Class', exact: true })
    ).toBeVisible();
    await shot('desktop-reloaded-class');
    await page.getByRole('link', { name: /Local Joined Class/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/my-classes/${klass.id}`));
    await page.reload();
    await expect(
      page.getByText('Local Permitted Assignment', { exact: true }).first()
    ).toBeVisible();
    await shot('desktop-reloaded-assignment');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('mobile-reloaded-assignment');
    const membership = await db.orgMembership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: student.id,
          organizationId: target.id,
        },
      },
      include: { classesAsStudent: true },
    });
    expect(membership.role).toBe('STUDENT');
    expect(membership.isOrgOwner).toBe(false);
    expect(membership.classesAsStudent.map((c) => c.id)).toContain(klass.id);
    expect(
      await db.orgMembership.findUnique({
        where: { id: prior.id },
        include: { classesAsStudent: true },
      })
    ).toMatchObject({
      userId: student.id,
      organizationId: source.id,
      role: 'STUDENT',
      isActive: true,
      classesAsStudent: [{ id: priorClass.id }],
    });

    const newcomer = await browser.newContext();
    try {
      const signup = await newcomer.newPage();
      await signup.goto(`/join?t=${joinToken}`);
      await signup.waitForLoadState('networkidle');
      await signup.getByLabel('Display name').fill('Local New Student');
      await signup.getByLabel('Handle', { exact: true }).fill(handle);
      await signup
        .getByLabel('Password', { exact: true })
        .fill('local-fixture-pass');
      await signup.getByLabel('Confirm password').fill('local-fixture-pass');
      await signup
        .getByRole('button', { name: 'Join class', exact: true })
        .click();
      await expect(signup).toHaveURL(/\/app(?:\?|$)/);
      await signup.goto(`/app/my-classes/${klass.id}`);
      await signup.reload();
      await expect(
        signup.getByText('Local Permitted Assignment', { exact: true }).first()
      ).toBeVisible();
      if (shots) {
        await signup.screenshot({
          path: `${shots}/desktop-new-student-control.png`,
          fullPage: true,
        });
        await appendFile(
          `${shots}/manifest.jsonl`,
          JSON.stringify({
            sourceSha,
            file: 'desktop-new-student-control.png',
            url: signup.url(),
            viewport: signup.viewportSize(),
            capturedAt: new Date().toISOString(),
            fixture:
              'Disposable local handle registration through existing join UI; deleted in finally.',
          }) + '\n'
        );
        await signup.setViewportSize({ width: 390, height: 844 });
        await signup.screenshot({
          path: `${shots}/mobile-new-student-control.png`,
          fullPage: true,
        });
        await appendFile(
          `${shots}/manifest.jsonl`,
          JSON.stringify({
            sourceSha,
            file: 'mobile-new-student-control.png',
            url: signup.url(),
            viewport: signup.viewportSize(),
            capturedAt: new Date().toISOString(),
            fixture:
              'Disposable local handle registration through existing join UI; deleted in finally.',
          }) + '\n'
        );
      }
    } finally {
      await newcomer.close();
    }
  } finally {
    const registered = await db.user.findUnique({
      where: { username: handle },
    });
    if (registered) users.push(registered.id);
    await db.session.deleteMany({ where: { userId: { in: users } } });
    if (assignmentId)
      await db.assignment.delete({ where: { id: assignmentId } });
    await db.freeTierApplication.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await db.orgMembership.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await db.class.deleteMany({
      where: { school: { organizationId: { in: orgs } } },
    });
    await db.school.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.organizationAssignmentType.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await db.organization.deleteMany({ where: { id: { in: orgs } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
