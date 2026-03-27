/* eslint-disable no-console */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPassword } from './utils';

// --- Connection setup (same pattern as seed.ts) ---

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

function getSchemaFromDatabaseUrl(url: string): string | undefined {
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

const schema =
  process.env.DATABASE_SCHEMA?.trim() ||
  getSchemaFromDatabaseUrl(connectionString);

const isLocal =
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1');

const isSimpleLocal =
  !schema &&
  (connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1'));

const adapter = isSimpleLocal
  ? new PrismaPg({ connectionString, ssl: false })
  : new PrismaPg(
      {
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      },
      schema ? { schema } : undefined
    );

const prisma = new PrismaClient({ adapter });

// --- Constants ---

const ORG_ID = 'e2e-test-org';
const ORG_NAME = 'E2E Test Organization';
const SCHOOL_CODE = 'E2E-SCHOOL';
const CLASS_CODE = 'E2E-CLASS';

// --- Overlay logic ---

export type E2EContext = {
  organizationId: string;
  userId: string;
  userEmail: string;
  adminUserId: string;
  adminEmail: string;
  profileId: string;
  studentCourseId: string;
  documentId: string;
  classId: string;
  classCode: string;
  schoolId: string;
  teacherProfileId: string;
  teacherName: string;
  teacherEmail: string;
};

async function upsertUser(
  data: {
    email: string;
    name: string;
    password: string;
    isAdmin?: boolean;
  },
) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    await prisma.password.upsert({
      where: { userId: existing.id },
      update: { hash: createPassword(data.password).hash },
      create: { userId: existing.id, hash: createPassword(data.password).hash },
    });
    if (data.isAdmin !== undefined) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isAdmin: data.isAdmin },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      isAdmin: data.isAdmin,
      password: { create: createPassword(data.password) },
    },
  });
}

export async function seedOverlay(): Promise<E2EContext> {
  console.log('🌱 Running seed overlay (test users on top of production data)...');

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: ORG_NAME },
    create: { id: ORG_ID, name: ORG_NAME },
  });

  // 2. School
  let school = await prisma.school.findFirst({
    where: { code: SCHOOL_CODE, organizationId: org.id },
  });
  if (!school) {
    school = await prisma.school.create({
      data: { name: 'E2E High', code: SCHOOL_CODE, organizationId: org.id },
    });
  }

  // 3. Teacher user + profile
  const teacherEmail = 'teacher.e2e@yawp.test';
  const teacherName = 'Mrs Test Teacher';
  const teacherUser = await upsertUser({
    email: teacherEmail,
    name: teacherName,
    password: 'teacher-e2e-password',
  });
  let teacherProfile = await prisma.profile.findFirst({
    where: { userId: teacherUser.id, organizationId: org.id },
    include: { teacherProfile: true },
  });
  if (!teacherProfile) {
    teacherProfile = await prisma.profile.create({
      data: {
        userId: teacherUser.id,
        organizationId: org.id,
        isOwner: true,
        teacherProfile: { create: {} },
      },
      include: { teacherProfile: true },
    });
  }
  if (!teacherProfile.teacherProfile) {
    await prisma.teacherProfile.create({ data: { profileId: teacherProfile.id } });
    teacherProfile = await prisma.profile.findUniqueOrThrow({
      where: { id: teacherProfile.id },
      include: { teacherProfile: true },
    });
  }
  const teacherProfileId = teacherProfile.teacherProfile!.id;
  // Link teacher to school
  await prisma.teacherProfile.update({
    where: { id: teacherProfileId },
    data: { schools: { connect: { id: school.id } } },
  });

  // 4. Class
  let klass = await prisma.class.findFirst({
    where: { code: CLASS_CODE, schoolId: school.id },
  });
  if (!klass) {
    klass = await prisma.class.create({
      data: {
        code: CLASS_CODE,
        schoolYear: '2024-2025',
        period: '1st',
        grade: '9th',
        schoolId: school.id,
        teachers: { connect: { id: teacherProfileId } },
      },
    });
  }

  // 5. Student user
  const studentUser = await upsertUser({
    email: 'jdoe@brock.software',
    name: 'John Doe',
    password: 'johndoe',
  });
  let studentProfileRecord = await prisma.profile.findFirst({
    where: { userId: studentUser.id, organizationId: org.id },
    include: { studentProfile: true },
  });
  if (!studentProfileRecord) {
    studentProfileRecord = await prisma.profile.create({
      data: {
        userId: studentUser.id,
        organizationId: org.id,
        isOwner: false,
      },
      include: { studentProfile: true },
    });
  }
  if (!studentProfileRecord.studentProfile) {
    await prisma.studentProfile.create({
      data: {
        profileId: studentProfileRecord.id,
        classes: { connect: { id: klass.id } },
      },
    });
    studentProfileRecord = await prisma.profile.findUniqueOrThrow({
      where: { id: studentProfileRecord.id },
      include: { studentProfile: true },
    });
  }

  // 6. Admin user
  const adminUser = await upsertUser({
    email: 'admin.e2e@yawp.test',
    name: 'Admin E2E',
    password: 'admin-e2e-password',
    isAdmin: true,
  });
  let adminProfile = await prisma.profile.findFirst({
    where: { userId: adminUser.id, organizationId: org.id },
  });
  if (!adminProfile) {
    adminProfile = await prisma.profile.create({
      data: {
        userId: adminUser.id,
        organizationId: org.id,
        isOwner: true,
      },
    });
  }

  // 7. Smoke test users (for preview environments)
  for (const u of [
    { email: 'teacher@fake.test', name: 'Teacher User', password: 'teacher123' },
    { email: 'admin@fake.test', name: 'Admin User', password: 'admin123', isAdmin: true as const },
    { email: 'student@fake.test', name: 'Student User', password: 'student123' },
  ]) {
    await upsertUser(u);
  }

  // 7b. Preview smoke uses teacher@fake.test — production data may already have that user without a
  // TeacherProfile; without it login lands on /no-profile instead of /app.
  const smokeTeacherUser = await prisma.user.findUnique({
    where: { email: 'teacher@fake.test' },
  });
  if (smokeTeacherUser) {
    let smokeTeacherProfile = await prisma.profile.findFirst({
      where: { userId: smokeTeacherUser.id, organizationId: org.id },
      include: { teacherProfile: true },
    });
    if (!smokeTeacherProfile) {
      smokeTeacherProfile = await prisma.profile.create({
        data: {
          userId: smokeTeacherUser.id,
          organizationId: org.id,
          isOwner: true,
          teacherProfile: { create: {} },
        },
        include: { teacherProfile: true },
      });
    }
    if (!smokeTeacherProfile.teacherProfile) {
      await prisma.teacherProfile.create({ data: { profileId: smokeTeacherProfile.id } });
      smokeTeacherProfile = await prisma.profile.findUniqueOrThrow({
        where: { id: smokeTeacherProfile.id },
        include: { teacherProfile: true },
      });
    }
    await prisma.teacherProfile.update({
      where: { id: smokeTeacherProfile.teacherProfile!.id },
      data: { schools: { connect: { id: school.id } } },
    });
  }

  // 8. Student course with modules + instructions
  let studentCourse = await prisma.studentCourse.findFirst({
    where: { title: 'E2E Course' },
    select: { id: true, studentCourseModules: { select: { id: true, position: true } } },
  });
  if (!studentCourse) {
    studentCourse = await prisma.studentCourse.create({
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
                showChatButton: true,
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
  }

  // 9. Link class to student course
  const existingLink = await prisma.classStudentCourse.findFirst({
    where: { classId: klass.id, studentCourseId: studentCourse.id },
  });
  if (!existingLink) {
    await prisma.classStudentCourse.create({
      data: { classId: klass.id, studentCourseId: studentCourse.id },
    });
  }

  // 10. Document
  let document = await prisma.document.findFirst({
    where: { profileId: studentProfileRecord.id, title: 'E2E Doc' },
    select: { id: true },
  });
  if (!document) {
    document = await prisma.document.create({
      data: {
        title: 'E2E Doc',
        text: 'This are a practice essay with grammar mistake. I went to the store, I buyed milk and bread. The students was excited for writing.',
        html: '<p>This are a practice essay with grammar mistake. I went to the store, I buyed milk and bread. The students was excited for writing.</p>',
        profileId: studentProfileRecord.id,
        classId: klass.id,
      },
      select: { id: true },
    });
  }

  // 11. Course module session
  const firstModuleId = studentCourse.studentCourseModules.sort(
    (a, b) => a.position - b.position
  )[0].id;
  const existingSession = await prisma.studentCourseModuleSession.findFirst({
    where: {
      documentId: document.id,
      studentCourseModuleId: firstModuleId,
    },
  });
  if (!existingSession) {
    await prisma.studentCourseModuleSession.create({
      data: {
        studentCourseModuleId: firstModuleId,
        studentProfileId: studentProfileRecord.studentProfile!.id,
        documentId: document.id,
        title: 'E2E Doc Session',
        instructionsCompleted: 0,
      },
    });
  }

  const context: E2EContext = {
    organizationId: org.id,
    userId: studentUser.id,
    userEmail: studentUser.email,
    adminUserId: adminUser.id,
    adminEmail: adminUser.email,
    profileId: studentProfileRecord.id,
    studentCourseId: studentCourse.id,
    documentId: document.id,
    classId: klass.id,
    classCode: CLASS_CODE,
    schoolId: school.id,
    teacherProfileId,
    teacherName,
    teacherEmail,
  };

  console.log('🌱 Seed overlay complete.');
  return context;
}

// When run as a standalone script, execute and print context
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed-overlay.ts')) {
  seedOverlay()
    .then((ctx) => {
      console.log(JSON.stringify(ctx, null, 2));
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
