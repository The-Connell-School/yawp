/* eslint-disable no-console */
import { PrismaClient } from '@app/prisma';
import {
  createPassword,
  cleanupDb,
} from '../../../packages/prisma/scripts/utils';

let prisma: PrismaClient | null = null;

export type E2EContext = {
  organizationId: string;
  userId: string;
  userEmail: string;
  profileId: string;
  studentCourseId: string;
  documentId: string;
  // Added for signup flow
  schoolId: string;
  schoolCode: string;
  teacherProfileId: string;
  teacherName: string;
  teacherEmail: string;
};

export async function seedE2E(): Promise<E2EContext> {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  console.log('🌱 Seeding E2E DB...');
  await cleanupDb(prisma);

  // Minimal org
  const org = await prisma.organization.create({
    data: { id: 'the-connell-school', name: 'The Connell School' },
  });

  // Seed a school for student signup flow
  const schoolCode = 'E2E-TEST';
  const school = await prisma.school.create({
    data: { name: 'E2E High', code: schoolCode, organizationId: org.id },
  });

  // Seed a teacher assigned to that school
  const seededTeacherEmail = 'teacher.e2e@yawp.test';
  const seededTeacherName = 'Mrs Test Teacher';
  const seededTeacher = await prisma.user.create({
    data: {
      email: seededTeacherEmail,
      name: seededTeacherName,
      profiles: {
        create: {
          organizationId: org.id,
          teacherProfile: { create: {} },
        },
      },
    },
    include: { profiles: { include: { teacherProfile: true } } },
  });
  const seededTeacherProfileId = seededTeacher.profiles[0].teacherProfile
    ?.id as string;
  await prisma.teacherProfile.update({
    where: { id: seededTeacherProfileId },
    data: { schools: { connect: { id: school.id } } },
  });

  // Test users
  const users = [
    {
      email: 'jdoe@brock.software',
      name: 'John Doe',
      password: { create: createPassword('johndoe') },
      profiles: { create: [{ organizationId: org.id, isOwner: false }] },
    },
  ];

  for (const u of users) {
    await prisma.user.create({ data: u });
  }

  // Minimal content needed by app index and editor navigation
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'jdoe@brock.software' },
  });
  const profile = await prisma.profile.findFirstOrThrow({
    where: { userId: user.id },
  });
  // Create a StudentProfile to satisfy FK on StudentCourseModuleSession
  const studentProfile = await prisma.studentProfile.create({
    data: { profileId: profile.id },
  });
  const studentCourse = await prisma.studentCourse.create({
    data: {
      title: 'E2E Course',
      position: 1,
      studentCourseModules: {
        create: [1, 2, 3].map((moduleIndex) => ({
          title: `E2E Module ${moduleIndex}`,
          position: moduleIndex,
          instructions: {
            create: [1, 2, 3].map((instructionIndex) => ({
              title: `Instruction ${moduleIndex}.${instructionIndex}`,
              prompt: `Prompt for instruction ${moduleIndex}.${instructionIndex}`,
              position: instructionIndex,
            })),
          },
        })),
      },
    },
    select: {
      id: true,
      studentCourseModules: { select: { id: true, position: true } },
    },
  });
  // Seed a starter document for the profile
  const document = await prisma.document.create({
    data: {
      title: 'E2E Doc',
      text: 'Seeded E2E document',
      html: '<p>Seeded E2E document</p>',
      profileId: profile.id,
    },
    select: { id: true },
  });
  // Link the document to the first module via a session
  await prisma.studentCourseModuleSession.create({
    data: {
      studentCourseModuleId: studentCourse.studentCourseModules.sort(
        (a, b) => a.position - b.position
      )[0].id,
      studentProfileId: studentProfile.id,
      documentId: document.id,
      title: 'E2E Doc Session',
      instructionsCompleted: 0,
    },
  });
  return {
    organizationId: org.id,
    userId: user.id,
    userEmail: user.email,
    profileId: profile.id,
    studentCourseId: studentCourse.id,
    documentId: document.id,
    schoolId: school.id,
    schoolCode,
    teacherProfileId: seededTeacherProfileId,
    teacherName: seededTeacherName,
    teacherEmail: seededTeacherEmail,
  };
}

// Note: this module is imported by Playwright global-setup, not run directly.
